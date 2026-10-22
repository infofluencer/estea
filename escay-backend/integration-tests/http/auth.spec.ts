import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { seedStorefrontFixture, type StorefrontFixture } from "./helpers/storefront-fixture"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    PAYTR_MOCK: "1",
    PAYTR_MERCHANT_ID: "",
    PAYTR_MERCHANT_KEY: "",
    PAYTR_MERCHANT_SALT: "",
    SHIPPING_CARRIER: "",
    COOKIE_SECURE: "false",
    AUTH_LOGIN_RATE_MAX: "5",
    AUTH_REGISTER_RATE_MAX: "5",
    AUTH_LOGIN_RATE_WINDOW_MS: "600000",
    AUTH_REGISTER_RATE_WINDOW_MS: "600000",
  },
  testSuite: ({ api, getContainer }) => {
    describe("Auth (register / verify gate / rate-limit)", () => {
      let fx: StorefrontFixture

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
      })

      it("register → customer create → login returns verification_required", async () => {
        const email = `auth-${Date.now()}@escay.test`
        const password = "IntegrationAuth2026!a"

        const register = await api.post(`/auth/customer/emailpass/register`, {
          email,
          password,
        })
        expect(register.status).toBeLessThan(300)
        const actorless = register.data.token as string
        expect(actorless).toBeTruthy()

        const customer = await api.post(
          `/store/customers`,
          { email, first_name: "Int", last_name: "Test" },
          {
            headers: {
              ...fx.storeHeaders.headers,
              Authorization: `Bearer ${actorless}`,
            },
          }
        )
        expect(customer.status).toBeLessThan(300)

        const login = await api.post(`/auth/customer/emailpass`, {
          email,
          password,
        })
        expect(login.data.verification_required).toEqual(true)
      })

      it("login rate-limit returns 429", async () => {
        const burnHeaders = {
          headers: {
            ...fx.storeHeaders.headers,
            "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
          },
          throwOnError: false,
        }
        let got429 = false
        for (let i = 0; i < 8; i++) {
          try {
            const res = await api.post(
              `/auth/customer/emailpass`,
              {
                email: `rl-${i}@escay.test`,
                password: "wrong-password",
              },
              burnHeaders
            )
            if (res.status === 429) {
              got429 = true
              break
            }
          } catch (e: unknown) {
            const status = (e as { response?: { status?: number } })?.response
              ?.status
            if (status === 429) {
              got429 = true
              break
            }
          }
        }
        expect(got429).toBeTruthy()
      })
    })
  },
})
