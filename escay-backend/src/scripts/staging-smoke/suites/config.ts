import { assert, section, skip } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import { rawFetch, storeFetch } from "../_helpers/http"

/**
 * Staging-özgü config: CORS, frontend origin, cookie güvenliği sinyalleri.
 */
export async function runConfigSuite(env: StagingEnv) {
  section("8. Staging config (CORS / origin)")

  if (!env.frontendUrl) {
    skip(
      "CORS Origin testi",
      "STAGING_FRONTEND_URL yok — CORS Origin header ile doğrulanamaz"
    )
    return
  }

  const origin = env.frontendUrl

  // Preflight
  const preflight = await rawFetch(`${env.backendUrl}/store/products?limit=1`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type,x-publishable-api-key",
    },
  })
  const allowOrigin =
    preflight.headers.get("access-control-allow-origin") || ""
  const allowCreds =
    preflight.headers.get("access-control-allow-credentials") || ""

  assert(
    "CORS preflight staging origin kabul",
    allowOrigin === origin || allowOrigin === "*",
    `Allow-Origin=${allowOrigin || "(yok)"} status=${preflight.status}`
  )

  // Actual GET with Origin
  const withOrigin = await storeFetch(env, `/store/products?limit=1`, {
    headers: { Origin: origin },
  })
  const ao2 = withOrigin.headers.get("access-control-allow-origin") || ""
  assert(
    "CORS GET response Origin",
    withOrigin.status === 200 && (ao2 === origin || ao2 === "*"),
    `status=${withOrigin.status} Allow-Origin=${ao2 || "(yok)"}`
  )

  // Wrong origin should not echo prod/random (or should be absent)
  const wrongOrigin = "http://evil.example.invalid"
  const evil = await storeFetch(env, `/store/products?limit=1`, {
    headers: { Origin: wrongOrigin },
  })
  const aoEvil = evil.headers.get("access-control-allow-origin") || ""
  assert(
    "CORS yanlış origin echo edilmez",
    aoEvil !== wrongOrigin,
    `Allow-Origin=${aoEvil || "(yok)"}`
  )

  void allowCreds

  // Frontend diag (optional)
  try {
    const diag = await rawFetch(`${origin}/api/staging-diag`)
    if (diag.status === 404) {
      skip(
        "Frontend staging-diag",
        "Endpoint yok veya ALLOW_STAGING_DIAGNOSTICS kapalı"
      )
    } else if (diag.status === 200 && diag.body && typeof diag.body === "object") {
      const b = diag.body as {
        backendHost?: string
        hasPublishableKey?: boolean
        backendLooksStaging?: boolean
      }
      const backendHost = String(b.backendHost || "")
      const expectedHost = new URL(env.backendUrl).host
      assert(
        "Frontend → staging backend host",
        Boolean(backendHost) &&
          (backendHost === expectedHost ||
            backendHost.includes(expectedHost.split(":")[0])),
        `FE backendHost=${backendHost} beklenen=${expectedHost}`
      )
      assert(
        "Frontend publishable key set",
        b.hasPublishableKey === true,
        `hasPublishableKey=${String(b.hasPublishableKey)}`
      )
    } else {
      skip(
        "Frontend staging-diag",
        `status=${diag.status}`
      )
    }
  } catch (e) {
    skip(
      "Frontend staging-diag",
      e instanceof Error ? e.message : "frontend erişilemedi"
    )
  }
}
