/**
 * PayTR Step 1 — gerçek get-token isteği, YALNIZCA test_mode=1.
 *
 * Canlıya dokunmaz:
 *  - test_mode istekte sabit "1"; env PAYTR_TEST_MODE "1" değilse çalışmaz.
 *  - merchant_oid "STG" (veya PAYTR_OID_PREFIX) + timestamp — prod
 *    oid'leriyle çakışmaz.
 *  - Panel Bildirim URL'i / Test Modu toggle'ı ile ilgisi yok; callback bu
 *    script'te beklenmez (Step 2 → test-paytr-callback.ts).
 *  - Sadece token alır; iframe tarayıcıda elle açılır.
 *
 *   PAYTR_TEST_MODE=1 npx tsx src/scripts/test-paytr-token.ts
 *
 * Env: PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT,
 *      PAYTR_TEST_MODE=1, opsiyonel PAYTR_USER_IP, PAYTR_OID_PREFIX, STOREFRONT_URL
 */
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import FormData from "form-data"
import {
  buildUserBasket,
  computeTokenHash,
  sanitizeEmail,
} from "../modules/paytr/hash"

const TEST_MODE = "1"
const PAYMENT_AMOUNT_KURUS = 100

/** Minimal .env loader — dotenv paketi eklemeden. */
function loadDotEnv(): void {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), name)
    if (!existsSync(path)) continue
    const text = readFileSync(path, "utf8")
    for (const line of text.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined) {
        process.env[key] = val
      }
    }
  }
}

function refuse(message: string): never {
  console.error(`\n[paytr-token] REDDEDİLDİ: ${message}\n`)
  process.exit(2)
}

function isPrivateIp(ip: string): boolean {
  return (
    /^(10\.|127\.|192\.168\.|169\.254\.|0\.)/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    /^f[cd]/i.test(ip)
  )
}

async function resolveUserIp(): Promise<{ ip: string; source: string }> {
  const fromEnv = process.env.PAYTR_USER_IP?.trim()
  if (fromEnv) return { ip: fromEnv, source: "PAYTR_USER_IP" }
  const res = await fetch("https://api.ipify.org?format=json")
  if (!res.ok) refuse(`Dış IP alınamadı (ipify http=${res.status}); PAYTR_USER_IP verin.`)
  const json = (await res.json()) as { ip?: string }
  if (!json.ip) refuse("Dış IP alınamadı; PAYTR_USER_IP verin.")
  return { ip: json.ip, source: "api.ipify.org" }
}

async function main() {
  loadDotEnv()

  const envTestMode = (process.env.PAYTR_TEST_MODE ?? "").trim()
  if (envTestMode !== TEST_MODE) {
    refuse(
      `PAYTR_TEST_MODE="${envTestMode || "(boş)"}". Bu script yalnızca PAYTR_TEST_MODE=1 ile çalışır.`
    )
  }

  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() || ""
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() || ""
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() || ""
  if (!merchantId || !merchantKey || !merchantSalt) {
    refuse("PAYTR_MERCHANT_ID / PAYTR_MERCHANT_KEY / PAYTR_MERCHANT_SALT eksik.")
  }
  if (!/^\d+$/.test(merchantId)) {
    refuse(`PAYTR_MERCHANT_ID sayısal değil ("${merchantId.slice(0, 4)}…") — yer tutucu mu?`)
  }

  const prefix =
    (process.env.PAYTR_OID_PREFIX || "STG").replace(/[^a-zA-Z0-9]/g, "") || "STG"
  if (prefix === "M") {
    refuse('PAYTR_OID_PREFIX="M" prod önekidir; staging için "STG" kullanın.')
  }
  const merchantOid = `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 64)

  const { ip: userIp, source: ipSource } = await resolveUserIp()
  if (isPrivateIp(userIp)) {
    refuse(`user_ip özel ağ adresi (${userIp}); PayTR dış IP ister.`)
  }

  const email = sanitizeEmail("stg-paytr-test@escay.test")
  const userBasket = buildUserBasket([
    { name: "STG PayTR test", unitPrice: PAYMENT_AMOUNT_KURUS / 100, quantity: 1 },
  ])
  const noInstallment = "0"
  const maxInstallment = "0"
  const currency = "TL"
  const storefront = (process.env.STOREFRONT_URL || "http://localhost:3015").replace(/\/$/, "")

  const paytrToken = computeTokenHash({
    merchantId,
    userIp,
    merchantOid,
    email,
    paymentAmount: PAYMENT_AMOUNT_KURUS,
    userBasket,
    noInstallment,
    maxInstallment,
    currency,
    testMode: TEST_MODE,
    merchantSalt,
    merchantKey,
  })

  const form = new FormData()
  form.append("merchant_id", merchantId)
  form.append("user_ip", userIp)
  form.append("merchant_oid", merchantOid)
  form.append("email", email)
  form.append("payment_amount", String(PAYMENT_AMOUNT_KURUS))
  form.append("paytr_token", paytrToken)
  form.append("user_basket", userBasket)
  form.append("debug_on", "1")
  form.append("no_installment", noInstallment)
  form.append("max_installment", maxInstallment)
  form.append("user_name", "STG Test")
  form.append("user_address", "Staging test, Türkiye")
  form.append("user_phone", "05000000000")
  form.append(
    "merchant_ok_url",
    `${storefront}/odeme/payment-result?status=success&oid=${merchantOid}`
  )
  form.append(
    "merchant_fail_url",
    `${storefront}/odeme/payment-result?status=failed&oid=${merchantOid}`
  )
  form.append("timeout_limit", "30")
  form.append("currency", currency)
  form.append("test_mode", TEST_MODE)
  form.append("lang", "tr")

  console.log("\n=== PayTR get-token (Step 1) ===")
  console.log(`  merchant_id    : ${merchantId}`)
  console.log(`  merchant_oid   : ${merchantOid}`)
  console.log(`  user_ip        : ${userIp}  (kaynak: ${ipSource})`)
  console.log(`  payment_amount : ${PAYMENT_AMOUNT_KURUS} kuruş (1 TL)`)
  console.log(`  test_mode      : ${TEST_MODE}  ← istekte ve hash'te`)
  console.log(`  debug_on       : 1`)

  const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
    method: "POST",
    body: form.getBuffer() as unknown as BodyInit,
    headers: form.getHeaders() as Record<string, string>,
  })
  const raw = await response.text()
  let json: { status?: string; token?: string; reason?: string }
  try {
    json = JSON.parse(raw)
  } catch {
    console.error(`\n  HTTP ${response.status} — JSON olmayan yanıt:\n${raw.slice(0, 500)}`)
    process.exit(1)
  }

  console.log(`\n  HTTP ${response.status}  status=${json.status ?? "-"}`)
  if (json.status === "success" && json.token) {
    console.log(`  iframe_token   : ${json.token}`)
    console.log(`  iframe URL     : https://www.paytr.com/odeme/guvenli/${json.token}`)
    console.log(
      "\n  Tarayıcıda açın; test modunda PayTR test kartını otomatik doldurur." +
        "\n  Not: bu oid için PayTR bildirimi panel Bildirim URL'ine (canlı WP) gider;" +
        "\n  WP bu oid'i tanımaz. Staging callback'i test-paytr-callback.ts ile simüle edilir."
    )
    console.log(
      `\n  Script B'de bilinmeyen-oid senaryosu için:\n    npx medusa exec ./src/scripts/test-paytr-callback.ts ${merchantOid}\n`
    )
    return
  }

  console.log(`  reason         : ${json.reason ?? "(yok)"}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(`[paytr-token] Hata: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
