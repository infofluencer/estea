import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

/**
 * Guest checkout creates customer(email, has_account=false). Register with the
 * same email creates a second customer (has_account=true). Medusa v2 has no
 * customer-merge workflow; order-transfer is a separate per-order token flow.
 *
 * After the registered customer has proven mailbox ownership (email
 * verification → actor JWT), re-point same-email guest orders onto the
 * registered customer_id. Guest customer row is left in place.
 */

export type LinkGuestOrdersInput = {
  /**
   * Verified email (auth identity entity_id after email verification). Required:
   * customer.email is client-chosen at POST /store/customers, so it is never
   * trusted on its own. Compared case-insensitively.
   */
  email?: string
  /** Registered customer (has_account=true). Preferred when known. */
  registeredCustomerId?: string
  /** Auth identity whose app_metadata.customer_id is the registered customer. */
  authIdentityId?: string
}

export type LinkGuestOrdersResult = {
  linkedOrderIds: string[]
  guestCustomerId?: string
  registeredCustomerId?: string
  skippedReason?: string
}

type CustomerRow = {
  id: string
  email?: string | null
  has_account?: boolean
}

type OrderRow = {
  id: string
  email?: string | null
  customer_id?: string | null
}

type CustomerService = {
  listCustomers: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<CustomerRow[]>
}

type OrderService = {
  listOrders: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<OrderRow[]>
  updateOrders: (
    data: { id: string; customer_id: string }[]
  ) => Promise<unknown>
}

const ORDER_PAGE = 200

export function normalizeCustomerEmail(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().toLowerCase()
}

function emailVariants(email: string): string[] {
  const trimmed = email.trim()
  const normalized = normalizeCustomerEmail(email)
  return Array.from(new Set([trimmed, normalized].filter(Boolean)))
}

export async function linkGuestOrdersToRegisteredCustomer(
  container: MedusaContainer,
  input: LinkGuestOrdersInput
): Promise<LinkGuestOrdersResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const customers = container.resolve(Modules.CUSTOMER) as CustomerService
  const orders = container.resolve(Modules.ORDER) as OrderService

  const inputEmail = normalizeCustomerEmail(input.email)
  if (!inputEmail) {
    return { linkedOrderIds: [], skippedReason: "verified_email_required" }
  }
  let registeredId = input.registeredCustomerId?.trim() || ""

  if (!registeredId && input.authIdentityId) {
    registeredId = await customerIdFromAuthIdentity(
      container,
      input.authIdentityId
    )
  }

  let registered: CustomerRow | undefined

  if (registeredId) {
    registered = (
      await customers.listCustomers(
        { id: registeredId },
        { select: ["id", "email", "has_account"], take: 1 }
      )
    )[0]
  } else {
    registered = (await listCustomersByEmail(customers, inputEmail)).find(
      (c) => c.has_account === true
    )
  }

  if (!registered?.id) {
    return { linkedOrderIds: [], skippedReason: "registered_customer_not_found" }
  }

  if (registered.has_account !== true) {
    return {
      linkedOrderIds: [],
      registeredCustomerId: registered.id,
      skippedReason: "customer_is_not_registered",
    }
  }

  const registeredEmail = normalizeCustomerEmail(registered.email)
  if (!registeredEmail) {
    return {
      linkedOrderIds: [],
      registeredCustomerId: registered.id,
      skippedReason: "registered_email_missing",
    }
  }

  // Security: never attach another mailbox's guest orders.
  if (inputEmail !== registeredEmail) {
    logger.warn(
      `[link-guest-orders] email mismatch input=${inputEmail} customer=${registeredEmail} — skip`
    )
    return {
      linkedOrderIds: [],
      registeredCustomerId: registered.id,
      skippedReason: "email_mismatch",
    }
  }

  const sameEmail = await listCustomersByEmail(customers, registeredEmail)
  const guest = sameEmail.find(
    (c) => c.has_account === false && c.id !== registered.id
  )

  if (!guest?.id) {
    return {
      linkedOrderIds: [],
      registeredCustomerId: registered.id,
      skippedReason: "no_guest_customer",
    }
  }

  const toLink: string[] = []
  let skip = 0
  for (;;) {
    const page = await orders.listOrders(
      { customer_id: guest.id },
      {
        select: ["id", "email", "customer_id"],
        take: ORDER_PAGE,
        skip,
      }
    )
    for (const order of page) {
      if (!order?.id) continue
      if (order.customer_id === registered.id) continue
      if (normalizeCustomerEmail(order.email) !== registeredEmail) {
        logger.warn(
          `[link-guest-orders] skip order=${order.id} email mismatch`
        )
        continue
      }
      toLink.push(order.id)
    }
    if (page.length < ORDER_PAGE) break
    skip += ORDER_PAGE
  }

  if (!toLink.length) {
    return {
      linkedOrderIds: [],
      guestCustomerId: guest.id,
      registeredCustomerId: registered.id,
    }
  }

  await orders.updateOrders(
    toLink.map((id) => ({ id, customer_id: registered.id }))
  )

  logger.info(
    `[link-guest-orders] linked ${toLink.length} order(s) guest=${guest.id} → registered=${registered.id} email=${registeredEmail}`
  )

  return {
    linkedOrderIds: toLink,
    guestCustomerId: guest.id,
    registeredCustomerId: registered.id,
  }
}

async function listCustomersByEmail(
  customers: CustomerService,
  email: string
): Promise<CustomerRow[]> {
  const normalized = normalizeCustomerEmail(email)
  if (!normalized) return []

  const variants = emailVariants(email)
  const rows = await customers.listCustomers(
    { email: variants.length === 1 ? variants[0] : variants },
    { select: ["id", "email", "has_account"], take: 10 }
  )
  return rows.filter((c) => normalizeCustomerEmail(c.email) === normalized)
}

type AuthProviderService = {
  listProviderIdentities: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<{ entity_id?: string | null }[]>
}

/**
 * Login email of an auth identity (emailpass entity_id). An actor JWT is only
 * issued once this address is verified, so for a logged-in customer this is
 * the proven mailbox — unlike customer.email.
 */
export async function verifiedEmailForAuthIdentity(
  container: MedusaContainer,
  authIdentityId: string | undefined
): Promise<string> {
  if (!authIdentityId) return ""
  const auth = container.resolve(Modules.AUTH) as AuthProviderService
  const rows = await auth.listProviderIdentities(
    { auth_identity_id: authIdentityId, provider: "emailpass" },
    { select: ["entity_id"], take: 1 }
  )
  return normalizeCustomerEmail(rows[0]?.entity_id)
}

export async function customerIdFromAuthIdentity(
  container: MedusaContainer,
  authIdentityId: string
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "auth_identity",
    fields: ["id", "app_metadata"],
    filters: { id: authIdentityId },
  })
  const meta = data?.[0]?.app_metadata as
    | { customer_id?: string }
    | null
    | undefined
  return typeof meta?.customer_id === "string" ? meta.customer_id : ""
}

/** Confirm / list / retrieve hooks: never fail the parent request. */
export async function tryLinkGuestOrdersToRegisteredCustomer(
  container: MedusaContainer,
  input: LinkGuestOrdersInput
): Promise<LinkGuestOrdersResult> {
  try {
    return await linkGuestOrdersToRegisteredCustomer(container, input)
  } catch (err) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[link-guest-orders] failed: ${message}`)
    return { linkedOrderIds: [], skippedReason: "error" }
  }
}
