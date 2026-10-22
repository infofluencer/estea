import { test, expect } from "@playwright/test"
import { stagingBackendUrl, stagingFrontendUrl } from "../../utils/env"

test.describe("6. Staging config", () => {
  test("staging-diag → backend host + publishable key", async ({ request }) => {
    const res = await request.get("/api/staging-diag")
    if (res.status() === 404) {
      test.skip(true, "ALLOW_STAGING_DIAGNOSTICS=1 gerekli")
      return
    }
    expect(res.ok()).toBeTruthy()
    const body = (await res.json()) as {
      backendHost?: string
      hasPublishableKey?: boolean
      backendLooksStaging?: boolean
    }
    expect(body.hasPublishableKey).toBe(true)
    expect(body.backendLooksStaging).toBe(true)
    const backend = stagingBackendUrl()
    if (backend && body.backendHost) {
      const expected = new URL(backend).host
      expect(
        body.backendHost === expected ||
          body.backendHost.includes(expected.split(":")[0])
      ).toBeTruthy()
    }
  })

  test("CORS: staging origin kabul", async ({ request }) => {
    const backend = stagingBackendUrl()
    test.skip(!backend, "STAGING_BACKEND_URL yok")
    const origin = stagingFrontendUrl()
    const res = await request.get(`${backend}/store/products?limit=1`, {
      headers: {
        Origin: origin,
        "x-publishable-api-key":
          process.env.STAGING_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
          "",
      },
    })
    expect(res.status()).toBe(200)
    const allow = res.headers()["access-control-allow-origin"] || ""
    expect(allow === origin || allow === "*").toBeTruthy()
  })

  test("FE→BE cart smoke", async ({ request }) => {
    const res = await request.get("/api/cart/smoke")
    expect(res.status()).toBeLessThan(500)
  })
})
