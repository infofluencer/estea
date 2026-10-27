/**
 * Staging: register a customer via HTTP (unverified), then print how to verify.
 *
 * Full verified account (recommended — runs inside backend):
 *   npm run auth:create-verified -- staging-e2e@escay.test 'StagingE2E2026!a'
 *
 * This remote helper (laptop → staging API):
 *   STAGING_BACKEND_URL=http://IP:9001 \
 *   STAGING_PUBLISHABLE_KEY=pk_... \
 *   npx tsx src/scripts/create-staging-customer-remote.ts \
 *     staging-e2e@escay.test 'StagingE2E2026!a'
 *
 * Then in staging backend container mark verified:
 *   npm run auth:mark-verified
 *   # or single-user: npm run auth:create-verified -- <email> <password>
 */
import { assertNotProdUrl } from "./staging-smoke/_helpers/env"

async function main() {
  const email = String(process.argv[2] || "")
    .trim()
    .toLowerCase()
  const password = String(process.argv[3] || "")
  const first = String(process.argv[4] || "Staging")
  const last = String(process.argv[5] || "E2E")

  if (!email || !password) {
    console.error(
      "Usage: npx tsx src/scripts/create-staging-customer-remote.ts <email> <password> [first] [last]"
    )
    process.exit(1)
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters")
    process.exit(1)
  }

  const backend = assertNotProdUrl(
    process.env.STAGING_BACKEND_URL || "",
    "STAGING_BACKEND_URL"
  )
    .toString()
    .replace(/\/$/, "")
  const pk =
    process.env.STAGING_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim() ||
    ""
  if (!pk) {
    console.error("STAGING_PUBLISHABLE_KEY gerekli")
    process.exit(1)
  }

  const register = await fetch(`${backend}/auth/customer/emailpass/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const regJson = (await register.json().catch(() => ({}))) as {
    token?: string
    message?: string
  }
  if (!register.ok || !regJson.token) {
    console.error("Register failed:", register.status, regJson)
    process.exit(1)
  }

  const customer = await fetch(`${backend}/store/customers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": pk,
      Authorization: `Bearer ${regJson.token}`,
    },
    body: JSON.stringify({
      email,
      first_name: first,
      last_name: last,
    }),
  })
  const custJson = await customer.json().catch(() => ({}))
  if (!customer.ok) {
    console.error("Customer create failed:", customer.status, custJson)
    process.exit(1)
  }

  console.log("OK — müşteri oluşturuldu (henüz verify yok):", email)
  console.log("")
  console.log("Verify için staging backend container'da:")
  console.log(
    `  medusa exec ./src/scripts/create-verified-customer.ts '${email}' '${password}'`
  )
  console.log("  # veya tümünü işaretle: npm run auth:mark-verified")
  console.log("")
  console.log("E2E:")
  console.log(`  STAGING_VERIFIED_EMAIL='${email}'`)
  console.log(`  STAGING_VERIFIED_PASSWORD='${password}'`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
