/**
 * Create a customer with emailpass auth and mark email as verified.
 * Staging E2E / smoke: STAGING_VERIFIED_EMAIL + STAGING_VERIFIED_PASSWORD.
 *
 * Usage (staging backend container / local medusa):
 *   medusa exec ./src/scripts/create-verified-customer.ts \
 *     staging-e2e@escay.test 'StagingE2E2026!a'
 *
 * Optional first/last:
 *   medusa exec ./src/scripts/create-verified-customer.ts \
 *     staging-e2e@escay.test 'StagingE2E2026!a' Staging E2E
 *
 * npm:
 *   npm run auth:create-verified -- staging-e2e@escay.test 'StagingE2E2026!a'
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import scrypt from "scrypt-kdf"
import { tryLinkGuestOrdersToRegisteredCustomer } from "../lib/link-guest-orders"

type AuthService = {
  register?: (
    provider: string,
    data: { body: Record<string, unknown> }
  ) => Promise<{
    success?: boolean
    authIdentity?: { id: string }
    error?: string
  }>
  createAuthIdentities?: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<{ id: string } | { id: string }[]>
  createProviderIdentities?: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<unknown>
  updateAuthIdentities?: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<unknown>
  updateProviderIdentities?: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<unknown>
  listAuthVerifications: (
    filters: Record<string, unknown>
  ) => Promise<{ id: string; verified_at?: Date | string | null }[]>
  createAuthVerifications: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<unknown>
  updateAuthVerifications: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<unknown>
}

type CustomerService = {
  createCustomers: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<{ id: string; email?: string } | { id: string; email?: string }[]>
}

async function hashPassword(password: string) {
  return (await scrypt.kdf(password, { logN: 15, r: 8, p: 1 })).toString(
    "base64"
  )
}

function asOne<T extends { id: string }>(
  value: T | T[] | null | undefined
): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] || null : value
}

export default async function createVerifiedCustomer({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const auth = container.resolve(Modules.AUTH) as AuthService
  const customers = container.resolve(Modules.CUSTOMER) as CustomerService

  const email = String(args?.[0] || "")
    .trim()
    .toLowerCase()
  const password = String(args?.[1] || "")
  const firstName = String(args?.[2] || "Staging").trim() || "Staging"
  const lastName = String(args?.[3] || "E2E").trim() || "E2E"

  if (!email || !password) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/create-verified-customer.ts <email> <password> [first] [last]"
    )
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters")
  }

  const { data: existingCustomers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "has_account"],
    filters: { email },
  })

  const existingRows = (existingCustomers || []) as {
    id?: string
    email?: string
    has_account?: boolean
  }[]
  const registeredExisting = existingRows.find((c) => c.has_account === true)
  let customerId =
    (registeredExisting?.id as string | undefined) ||
    (existingRows[0]?.id as string | undefined)

  if (!customerId) {
    const created = asOne(
      await customers.createCustomers({
        email,
        first_name: firstName,
        last_name: lastName,
      })
    )
    if (!created?.id) throw new Error("Customer create failed")
    customerId = created.id
    logger.info(`[create-verified-customer] customer created ${customerId}`)
  } else {
    logger.info(
      `[create-verified-customer] customer exists ${customerId} — updating auth`
    )
  }

  const { data: providerRows } = await query.graph({
    entity: "provider_identity",
    fields: [
      "id",
      "entity_id",
      "provider",
      "auth_identity_id",
      "provider_metadata",
    ],
    filters: { entity_id: email, provider: "emailpass" },
  })

  let authIdentityId = providerRows?.[0]?.auth_identity_id as
    | string
    | undefined
  let providerIdentityId = providerRows?.[0]?.id as string | undefined

  const passwordHash = await hashPassword(password)

  if (!authIdentityId || !providerIdentityId) {
    // Prefer Auth module register when available
    if (typeof auth.register === "function") {
      const reg = await auth.register("emailpass", {
        body: { email, password },
      })
      if (!reg?.success || !reg.authIdentity?.id) {
        // May fail if identity exists without provider row — fall through
        logger.warn(
          `[create-verified-customer] auth.register: ${reg?.error || "no identity"} — manual create`
        )
      } else {
        authIdentityId = reg.authIdentity.id
      }
    }

    if (!authIdentityId) {
      if (typeof auth.createAuthIdentities !== "function") {
        throw new Error("Auth module cannot create identities")
      }
      const identity = asOne(
        await auth.createAuthIdentities({
          app_metadata: { customer_id: customerId },
        })
      )
      if (!identity?.id) throw new Error("createAuthIdentities failed")
      authIdentityId = identity.id

      if (typeof auth.createProviderIdentities !== "function") {
        throw new Error("Auth module cannot create provider identities")
      }
      await auth.createProviderIdentities({
        entity_id: email,
        provider: "emailpass",
        auth_identity_id: authIdentityId,
        provider_metadata: { password: passwordHash },
      })
    } else if (typeof auth.updateProviderIdentities === "function") {
      // register created identity — ensure password + re-query provider id
      const { data: again } = await query.graph({
        entity: "provider_identity",
        fields: ["id", "auth_identity_id", "provider_metadata"],
        filters: { entity_id: email, provider: "emailpass" },
      })
      providerIdentityId = again?.[0]?.id
      authIdentityId = again?.[0]?.auth_identity_id || authIdentityId
      if (providerIdentityId) {
        await auth.updateProviderIdentities({
          id: providerIdentityId,
          provider_metadata: {
            ...(again?.[0]?.provider_metadata || {}),
            password: passwordHash,
          },
        })
      }
    }
  } else if (typeof auth.updateProviderIdentities === "function") {
    await auth.updateProviderIdentities({
      id: providerIdentityId,
      provider_metadata: {
        ...(providerRows?.[0]?.provider_metadata || {}),
        password: passwordHash,
      },
    })
  }

  // Re-resolve auth identity id if needed
  if (!authIdentityId) {
    const { data: again } = await query.graph({
      entity: "provider_identity",
      fields: ["auth_identity_id"],
      filters: { entity_id: email, provider: "emailpass" },
    })
    authIdentityId = again?.[0]?.auth_identity_id
  }
  if (!authIdentityId) {
    throw new Error("Could not resolve auth_identity_id for emailpass")
  }

  if (typeof auth.updateAuthIdentities === "function") {
    await auth.updateAuthIdentities({
      id: authIdentityId,
      app_metadata: { customer_id: customerId },
    })
  }

  const now = new Date()
  const existing = await auth.listAuthVerifications({
    auth_identity_id: authIdentityId,
    entity_id: email,
    entity_type: "email",
  })

  if (existing?.[0]?.verified_at) {
    logger.info(`[create-verified-customer] already verified: ${email}`)
  } else if (existing?.[0]) {
    await auth.updateAuthVerifications({
      id: existing[0].id,
      verified_at: now,
    })
    logger.info(`[create-verified-customer] verification updated: ${email}`)
  } else {
    await auth.createAuthVerifications({
      auth_identity_id: authIdentityId,
      entity_id: email,
      entity_type: "email",
      code_provider: "token",
      requested_at: now,
      verified_at: now,
    })
    logger.info(`[create-verified-customer] verification created: ${email}`)
  }

  const linked = await tryLinkGuestOrdersToRegisteredCustomer(container, {
    email,
    registeredCustomerId: customerId,
  })
  if (linked.linkedOrderIds.length) {
    logger.info(
      `[create-verified-customer] linked ${linked.linkedOrderIds.length} guest order(s)`
    )
  }

  logger.info(
    `[create-verified-customer] OK email=${email} customer_id=${customerId}`
  )
  logger.info(
    `Export for E2E:\n  STAGING_VERIFIED_EMAIL='${email}'\n  STAGING_VERIFIED_PASSWORD='${password}'`
  )
}
