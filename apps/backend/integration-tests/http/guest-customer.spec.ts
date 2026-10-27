import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import { placeGuestStubOrder } from "./helpers/place-order"

jest.setTimeout(180 * 1000)

type ApiClient = {
  post: Function
  get: Function
}

type AuthService = {
  requestAuthVerification: (data: {
    auth_identity_id: string
    entity_id: string
    entity_type: string
    code_provider: string
  }) => Promise<{ code?: string }>
}

async function registerCustomer(
  api: ApiClient,
  fx: StorefrontFixture,
  email: string,
  password: string
) {
  const register = await api.post(`/auth/customer/emailpass/register`, {
    email,
    password,
  })
  const actorless = register.data.token as string
  const customer = await api.post(
    `/store/customers`,
    { email, first_name: "Guest", last_name: "Upgrade" },
    {
      headers: {
        ...fx.storeHeaders.headers,
        Authorization: `Bearer ${actorless}`,
      },
    }
  )
  return {
    actorless,
    registeredId: customer.data.customer.id as string,
  }
}

async function confirmEmail(
  api: ApiClient,
  getContainer: () => {
    resolve: (key: string) => unknown
  },
  email: string,
  actorless: string
) {
  const query = getContainer().resolve(ContainerRegistrationKeys.QUERY) as {
    graph: (input: unknown) => Promise<{ data?: { auth_identity_id?: string }[] }>
  }
  const auth = getContainer().resolve(Modules.AUTH) as AuthService

  const { data } = await query.graph({
    entity: "provider_identity",
    fields: ["auth_identity_id"],
    filters: { entity_id: email, provider: "emailpass" },
  })
  const authIdentityId = data?.[0]?.auth_identity_id
  if (!authIdentityId) {
    throw new Error(`No emailpass identity for ${email}`)
  }

  const requested = await auth.requestAuthVerification({
    auth_identity_id: authIdentityId,
    entity_id: email,
    entity_type: "email",
    code_provider: "token",
  })
  if (!requested.code) {
    throw new Error("requestAuthVerification did not return a code")
  }

  const confirm = await api.post(
    `/auth/verification/confirm`,
    { code: requested.code, code_provider: "token" },
    { headers: { Authorization: `Bearer ${actorless}` } }
  )
  expect(confirm.status).toEqual(200)
  return confirm
}

/**
 * Guest checkout creates customer(email, has_account=false).
 * Register with the same email creates a SECOND customer (has_account=true).
 * Orders stay on the guest until email verification; then they are re-pointed.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {
    PAYTR_MOCK: "1",
    PAYTR_MERCHANT_ID: "",
    PAYTR_MERCHANT_KEY: "",
    PAYTR_MERCHANT_SALT: "",
    SHIPPING_CARRIER: "",
    COOKIE_SECURE: "false",
  },
  testSuite: ({ api, getContainer }) => {
    describe("Guest → register (same email)", () => {
      let fx: StorefrontFixture
      let variantId: string

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1)
        variantId = products[0].variants![0].id
      })

      it("register does not link; email confirm moves guest orders onto the account", async () => {
        const email = `guest-reg-${Date.now()}@escay.test`
        const password = "IntegrationAuth2026!a"

        const order = await placeGuestStubOrder(api, fx, variantId, email)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const customers = getContainer().resolve(Modules.CUSTOMER) as {
          listCustomers: (
            filters: Record<string, unknown>
          ) => Promise<{ id: string; email?: string; has_account?: boolean }[]>
        }
        const afterGuest = await customers.listCustomers({ email })
        expect(afterGuest.length).toBeGreaterThanOrEqual(1)
        const guest = afterGuest.find((c) => c.has_account === false)
        expect(guest?.id).toBeTruthy()

        const { data: orderRows } = await query.graph({
          entity: "order",
          fields: ["id", "customer_id", "email"],
          filters: { id: order.id },
        })
        expect(
          (orderRows?.[0] as { customer_id?: string }).customer_id
        ).toEqual(guest!.id)

        const { actorless, registeredId } = await registerCustomer(
          api,
          fx,
          email,
          password
        )
        expect(registeredId).not.toEqual(guest!.id)

        const rows = await customers.listCustomers({ email })
        expect(rows.some((c) => c.has_account === false)).toBeTruthy()
        expect(rows.some((c) => c.has_account === true)).toBeTruthy()

        const { data: still } = await query.graph({
          entity: "order",
          fields: ["id", "customer_id"],
          filters: { id: order.id },
        })
        expect((still?.[0] as { customer_id?: string }).customer_id).toEqual(
          guest!.id
        )

        const loginUnverified = await api.post(`/auth/customer/emailpass`, {
          email,
          password,
        })
        expect(loginUnverified.data.verification_required).toEqual(true)

        await confirmEmail(api, getContainer, email, actorless)

        const { data: linked } = await query.graph({
          entity: "order",
          fields: ["id", "customer_id"],
          filters: { id: order.id },
        })
        expect((linked?.[0] as { customer_id?: string }).customer_id).toEqual(
          registeredId
        )

        const guestsStill = await customers.listCustomers({
          email,
          has_account: false,
        })
        expect(guestsStill.some((c) => c.id === guest!.id)).toBeTruthy()

        const login = await api.post(`/auth/customer/emailpass`, {
          email,
          password,
        })
        expect(login.data.verification_required).toBeFalsy()
        const actor = login.data.token as string
        expect(actor).toBeTruthy()

        const listed = await api.get(`/store/orders`, {
          headers: {
            ...fx.storeHeaders.headers,
            Authorization: `Bearer ${actor}`,
          },
        })
        expect(listed.status).toEqual(200)
        const ids = (listed.data.orders as { id: string }[]).map((o) => o.id)
        expect(ids).toContain(order.id)

        const listedAgain = await api.get(`/store/orders`, {
          headers: {
            ...fx.storeHeaders.headers,
            Authorization: `Bearer ${actor}`,
          },
        })
        expect(
          (listedAgain.data.orders as { id: string }[]).map((o) => o.id)
        ).toContain(order.id)

        const lookup = await api.post(
          `/store/orders/lookup`,
          { id: order.id, email },
          fx.storeHeaders
        )
        expect(lookup.status).toEqual(200)
        expect(lookup.data.order.id).toEqual(order.id)
      })

      it("does not attach another mailbox's guest orders after verify", async () => {
        const emailA = `guest-iso-a-${Date.now()}@escay.test`
        const emailB = `guest-iso-b-${Date.now()}@escay.test`
        const password = "IntegrationAuth2026!a"

        const orderA = await placeGuestStubOrder(api, fx, variantId, emailA)
        const { actorless, registeredId } = await registerCustomer(
          api,
          fx,
          emailB,
          password
        )
        await confirmEmail(api, getContainer, emailB, actorless)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["id", "customer_id"],
          filters: { id: orderA.id },
        })
        expect(
          (data?.[0] as { customer_id?: string }).customer_id
        ).not.toEqual(registeredId)

        const login = await api.post(`/auth/customer/emailpass`, {
          email: emailB,
          password,
        })
        const listed = await api.get(`/store/orders`, {
          headers: {
            ...fx.storeHeaders.headers,
            Authorization: `Bearer ${login.data.token}`,
          },
        })
        const ids = (listed.data.orders as { id: string }[]).map((o) => o.id)
        expect(ids).not.toContain(orderA.id)
      })

      it("rejects a customer whose email differs from the registration login email", async () => {
        const victim = `guest-victim-${Date.now()}@escay.test`
        const attacker = `guest-attacker-${Date.now()}@escay.test`
        const order = await placeGuestStubOrder(api, fx, variantId, victim)

        const register = await api.post(`/auth/customer/emailpass/register`, {
          email: attacker,
          password: "IntegrationAuth2026!a",
        })
        const res = await api
          .post(
            `/store/customers`,
            { email: victim, first_name: "X", last_name: "Y" },
            {
              headers: {
                ...fx.storeHeaders.headers,
                Authorization: `Bearer ${register.data.token}`,
              },
            }
          )
          .catch((e: { response: { status: number } }) => e.response)
        expect(res.status).toBeGreaterThanOrEqual(400)

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "customer",
          fields: ["id", "has_account"],
          filters: { email: victim },
        })
        expect(
          (data as { has_account?: boolean }[]).some((c) => c.has_account)
        ).toBeFalsy()
        const { data: orders } = await query.graph({
          entity: "order",
          fields: ["id", "customer_id"],
          filters: { id: order.id },
        })
        expect(orders).toHaveLength(1)
      })
    })
  },
})
