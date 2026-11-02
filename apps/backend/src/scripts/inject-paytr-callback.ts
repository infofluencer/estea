/**
 * PayTR callback enjeksiyonu — panel Bildirim URL'i bize bakmazken iframe testi.
 *
 * İframe'de (test_mode=1) ödeme yapılır, PayTR bildirimi paneldeki eski adrese gider.
 * Bu script aynı bildirimi kendi /paytr/callback ucumuza POST'lar; hash backend'in
 * PAYTR_MERCHANT_KEY/SALT'ı ile hesaplandığı için gerçek bildirimden ayırt edilmez.
 * DB'ye dokunmaz, PayTR'a istek atmaz.
 *
 *   npx tsx src/scripts/inject-paytr-callback.ts --oid STG… --amount 19990 [--status success|failed]
 *
 * --amount kuruş (199,90 TL → 19990). Sipariş tutarıyla birebir aynı olmalı; fark
 * varsa backend "amount_mismatch" uyarısı üretir, capture etmez.
 * merchant_oid: admin sipariş → Ödeme → session data, ya da backend log'undaki
 * "[paytr] get-token ... merchant_oid=" satırı.
 *
 * Env (.env / .env.local okunur): PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT,
 * MEDUSA_BACKEND_URL (varsayılan http://localhost:9000). Güvenlik: PAYTR_OID_PREFIX
 * doluysa oid o önekle başlamalı; canlı (PAYTR_TEST_MODE=0) ortamda çalışmaz.
 */
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { computeCallbackHash, paytrOidPrefix } from "../modules/paytr/hash"

function loadDotEnv(): void {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), name)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf8").split("\n")) {
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
      if (process.env[key] === undefined) process.env[key] = val
    }
  }
}

function refuse(message: string): never {
  console.error(`\n[inject-callback] REDDEDİLDİ: ${message}\n`)
  process.exit(2)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  return process.argv[i + 1]
}

async function main() {
  loadDotEnv()

  const oid = (arg("oid") || "").trim()
  const amount = (arg("amount") || "").trim()
  const status = (arg("status") || "success").trim()

  if (!oid) refuse("--oid zorunlu (merchant_oid).")
  if (!/^\d+$/.test(amount) || Number(amount) <= 0) refuse("--amount kuruş tamsayı olmalı (ör. 19990).")
  if (status !== "success" && status !== "failed") refuse("--status success | failed.")

  const merchantKey = (process.env.PAYTR_MERCHANT_KEY || "").trim()
  const merchantSalt = (process.env.PAYTR_MERCHANT_SALT || "").trim()
  if (!merchantKey || !merchantSalt) refuse("PAYTR_MERCHANT_KEY / PAYTR_MERCHANT_SALT boş.")

  if ((process.env.PAYTR_TEST_MODE ?? "1").trim() === "0") {
    refuse("PAYTR_TEST_MODE=0 (canlı) — bu script yalnızca test modunda çalışır.")
  }
  const prefix = paytrOidPrefix()
  if (prefix && !oid.startsWith(prefix)) {
    refuse(`PAYTR_OID_PREFIX=${prefix} iken oid "${oid}" bu önekle başlamıyor.`)
  }

  const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const hash = computeCallbackHash({
    merchantOid: oid,
    merchantSalt,
    status,
    totalAmount: amount,
    merchantKey,
  })

  const body = new URLSearchParams({
    merchant_oid: oid,
    status,
    total_amount: amount,
    payment_amount: amount,
    hash,
  })
  if (status === "failed") {
    body.set("failed_reason_code", "6")
    body.set("failed_reason_msg", "Elle enjekte edilen test hatası")
  }

  console.log(`\n[inject-callback] POST ${backend}/paytr/callback`)
  console.log(`  merchant_oid=${oid} status=${status} amount=${amount} kuruş`)

  const res = await fetch(`${backend}/paytr/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = (await res.text()).trim()
  console.log(`  → HTTP ${res.status} "${text}"`)

  if (res.status === 200 && text === "OK") {
    console.log(
      status === "success"
        ? "  Backend kabul etti. Admin → sipariş ödeme durumu 'captured', Logs → payment.succeeded olmalı.\n" +
            "  (Tutar uyuşmazsa ya da sipariş iptalse yine OK döner; o zaman Logs'ta payment.alert ve uyarı maili vardır.)"
        : "  Backend kabul etti. Sipariş açık kalır, session sayacı +1 (Logs → payment.failed)."
    )
    return
  }
  if (text.includes("bad hash")) {
    console.error("  Hash reddedildi: bu makinedeki PAYTR_MERCHANT_KEY/SALT backend'inkinden farklı.")
  }
  process.exit(1)
}

main().catch((err) => {
  console.error(`[inject-callback] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
