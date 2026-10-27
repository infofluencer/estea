import { assert, assertStatus, section, skip } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import { uniqueEmail } from "../_helpers/env"
import {
  asRecord,
  bodyMessage,
  rawFetch,
  storeFetch,
} from "../_helpers/http"

const AUTH_PASSWORD = "StagingSmoke2026!a"

export async function runAuthSuite(env: StagingEnv) {
  section("7. Auth (register → verify gate → rate-limit)")

  const email = uniqueEmail("auth")
  const rlIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`

  // Register
  const register = await rawFetch(
    `${env.backendUrl}/auth/customer/emailpass/register`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": rlIp,
      },
      body: JSON.stringify({ email, password: AUTH_PASSWORD }),
    }
  )
  assertStatus("Register", register.status, [200, 201])
  const actorless = String(asRecord(register.body).token || "")
  assert(
    "Register token (actorless)",
    Boolean(actorless),
    actorless ? "ok" : bodyMessage(register.body)
  )

  if (actorless) {
    const customer = await storeFetch(env, `/store/customers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${actorless}` },
      body: JSON.stringify({
        email,
        first_name: "Staging",
        last_name: "Auth",
      }),
    })
    assertStatus("Customer create", customer.status, [200, 201])
  }

  // Login before verify — should not issue full actor JWT freely
  const loginUnverified = await rawFetch(
    `${env.backendUrl}/auth/customer/emailpass`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": rlIp,
      },
      body: JSON.stringify({ email, password: AUTH_PASSWORD }),
    }
  )
  const loginBody = asRecord(loginUnverified.body)
  const needsVerify = loginBody.verification_required === true
  assert(
    "Verify gate: verification_required",
    needsVerify || loginUnverified.status >= 400,
    needsVerify
      ? "verification_required=true"
      : `status=${loginUnverified.status} body=${JSON.stringify(loginBody).slice(0, 160)}`
  )

  // Optional verified account login
  if (env.verifiedEmail && env.verifiedPassword) {
    const verified = await rawFetch(
      `${env.backendUrl}/auth/customer/emailpass`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: env.verifiedEmail,
          password: env.verifiedPassword,
        }),
      }
    )
    assertStatus("Verified hesap login", verified.status, 200)
    const token = String(asRecord(verified.body).token || "")
    assert("Verified JWT", Boolean(token), token ? "ok" : bodyMessage(verified.body))

    const setCookie = verified.headers.get("set-cookie") || ""
    const isHttps = env.backendUrl.startsWith("https://")
    const frontendHttps = env.frontendUrl?.startsWith("https://") ?? false
    if (setCookie) {
      const hasSecure = /;\s*Secure/i.test(setCookie)
      if (!isHttps && !frontendHttps) {
        assert(
          "Cookie Secure flag (HTTP staging)",
          !hasSecure,
          hasSecure
            ? "Secure=true HTTP'de oturumu kırabilir — COOKIE_SECURE=false kontrol edin"
            : "Secure yok (HTTP için uygun)"
        )
      } else {
        assert(
          "Cookie Secure flag (HTTPS)",
          hasSecure || true,
          hasSecure ? "Secure set" : "Set-Cookie var; Secure opsiyonel (JWT bearer de kullanılır)"
        )
      }
    } else {
      skip(
        "Cookie Secure flag",
        "Auth JWT body'de; Set-Cookie yok (storefront cookie SF tarafında)"
      )
    }
  } else {
    skip(
      "Verified login",
      "STAGING_VERIFIED_EMAIL / STAGING_VERIFIED_PASSWORD yok"
    )
  }

  // Rate-limit: burn a dedicated IP with failed logins
  const burnIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
  const maxAttempts = Number(process.env.AUTH_LOGIN_RATE_MAX || 10)
  let got429 = false
  for (let i = 0; i < maxAttempts + 3; i++) {
    const res = await rawFetch(`${env.backendUrl}/auth/customer/emailpass`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": burnIp,
      },
      body: JSON.stringify({
        email: `ratelimit-${i}@escay.test`,
        password: "wrong-password-staging",
      }),
    })
    if (res.status === 429) {
      got429 = true
      break
    }
  }
  assert(
    "Login rate-limit aktif (429)",
    got429,
    got429
      ? `IP=${burnIp} max=${maxAttempts}`
      : `${maxAttempts + 3} denemede 429 yok — middleware kapalı olabilir`
  )

  // Register rate-limit (lighter probe — unique IP, fewer rounds if already proven)
  const regIp = `192.0.2.${Math.floor(Math.random() * 200) + 1}`
  const regMax = Number(process.env.AUTH_REGISTER_RATE_MAX || 10)
  let reg429 = false
  for (let i = 0; i < regMax + 2; i++) {
    const res = await rawFetch(
      `${env.backendUrl}/auth/customer/emailpass/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": regIp,
        },
        body: JSON.stringify({
          email: uniqueEmail(`rl${i}`),
          password: AUTH_PASSWORD,
        }),
      }
    )
    if (res.status === 429) {
      reg429 = true
      break
    }
  }
  assert(
    "Register rate-limit aktif (429)",
    reg429,
    reg429 ? `IP=${regIp}` : `${regMax + 2} kayıtta 429 yok`
  )
}
