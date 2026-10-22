/**
 * PayTR hash fonksiyonları birim test scripti.
 *
 * Çalıştırmak için:
 *   npx tsx src/scripts/test-paytr-hash.ts
 *
 * Bu script gerçek PayTR sunucusuna BAĞLANMAZ.
 * Yalnızca hash formüllerini ve merchant_oid mantığını test eder.
 */

import { readFileSync } from "fs"
import { join } from "path"
import {
  buildMerchantOid,
  buildRefundReferenceNo,
  buildUserBasket,
  computeCallbackHash,
  computeRefundHash,
  computeTokenHash,
  callbackAmountMatchesSession,
  formatPaytrReturnAmount,
  sanitizeEmail,
  sessionAmountToKurus,
  verifyCallbackHash,
} from "../modules/paytr/hash"

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)
    failed++
  }
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  assert(label, ok, ok ? "" : `got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)}`)
}

// ─── Test 1: sanitizeEmail ────────────────────────────────────────
console.log("\n=== 1. sanitizeEmail ===")
assertEqual("normal email", sanitizeEmail("test@example.com"), "test@example.com")
assertEqual("Türkçe ş", sanitizeEmail("şimşek@örnek.com"), "simsek@ornek.com")
assertEqual("Türkçe İ", sanitizeEmail("İnanç@test.com"), "Inanc@test.com")
assertEqual("Türkçe üü", sanitizeEmail("müşteri@market.esteacay.com"), "musteri@market.esteacay.com")

// ─── Test 2: buildMerchantOid ─────────────────────────────────────
console.log("\n=== 2. buildMerchantOid ===")
const sessionId = "payses_01ABC123_xyz789"
const oid = buildMerchantOid(sessionId)
console.log(`  session_id: ${sessionId}`)
console.log(`  merchant_oid: ${oid}`)
assert("sadece alfanumerik", /^[a-zA-Z0-9]+$/.test(oid))
assert("max 64 char", oid.length <= 64)
assert("'M' ile başlar", oid.startsWith("M"))

const oid2 = buildMerchantOid("payses_01ABC123_xyz789")
assertEqual("deterministic", oid, oid2)

// ─── Test 3: buildUserBasket ─────────────────────────────────────
console.log("\n=== 3. buildUserBasket ===")
const basket = buildUserBasket([
  { name: "Ürün A", unitPrice: 99.9, quantity: 2 },
  { name: "Ürün B", unitPrice: 249.0, quantity: 1 },
])
console.log(`  user_basket (base64): ${basket}`)
const decoded = JSON.parse(Buffer.from(basket, "base64").toString("utf8"))
assert("array döner", Array.isArray(decoded))
assertEqual("2 ürün", decoded.length, 2)
assertEqual("ilk ürün adı", decoded[0][0], "Ürün A")
assertEqual("birim fiyat string", decoded[0][1], "99.90")
assertEqual("adet", decoded[0][2], 2)

// ─── Test 4: computeTokenHash (Adım 1) ───────────────────────────
console.log("\n=== 4. computeTokenHash (Adım 1 — get-token) ===")

const tokenInput = {
  merchantId: "TEST_MERCHANT",
  userIp: "1.2.3.4",
  merchantOid: "MORDER001",
  email: "musteri@test.com",
  paymentAmount: 19990,         // 199.90 TL × 100
  userBasket: basket,
  noInstallment: "0",
  maxInstallment: "0",
  currency: "TL",
  testMode: "1",
  merchantSalt: "TEST_SALT",
  merchantKey: "TEST_KEY",
}

const token1 = computeTokenHash(tokenInput)
const token2 = computeTokenHash(tokenInput)
console.log(`  paytr_token: ${token1}`)
assert("base64 formatı", /^[A-Za-z0-9+/]+=*$/.test(token1))
assertEqual("deterministic (same input → same hash)", token1, token2)

// Farklı input → farklı hash
const tokenDiff = computeTokenHash({ ...tokenInput, paymentAmount: 19991 })
assert("farklı amount → farklı hash", token1 !== tokenDiff)

// Alan sırasının önemi (dokumentasyona birebir uygunluk testi)
// hash_str = merchantId+userIp+merchantOid+email+amount+basket+noInst+maxInst+currency+testMode+salt
import crypto from "crypto"

const hashStrManual =
  tokenInput.merchantId +
  tokenInput.userIp +
  tokenInput.merchantOid +
  tokenInput.email +
  String(tokenInput.paymentAmount) +
  tokenInput.userBasket +
  tokenInput.noInstallment +
  tokenInput.maxInstallment +
  tokenInput.currency +
  tokenInput.testMode

const manualToken = crypto
  .createHmac("sha256", tokenInput.merchantKey)
  .update(hashStrManual + tokenInput.merchantSalt)
  .digest("base64")

assertEqual("döküman formülüne birebir eşleşme", token1, manualToken)

// ─── Test 5: computeCallbackHash (Adım 2) ────────────────────────
console.log("\n=== 5. computeCallbackHash (Adım 2 — callback doğrulama) ===")

const callbackInput = {
  merchantOid: "MORDER001",
  merchantSalt: "TEST_SALT",
  status: "success",
  totalAmount: "19990",
  merchantKey: "TEST_KEY",
}

const cbHash1 = computeCallbackHash(callbackInput)
const cbHash2 = computeCallbackHash(callbackInput)
console.log(`  callback hash: ${cbHash1}`)
assert("base64 formatı", /^[A-Za-z0-9+/]+=*$/.test(cbHash1))
assertEqual("deterministic", cbHash1, cbHash2)

// Manuel hesaplama ile karşılaştır (döküman: merchant_oid+salt+status+total_amount)
const cbManual = crypto
  .createHmac("sha256", callbackInput.merchantKey)
  .update(
    callbackInput.merchantOid +
    callbackInput.merchantSalt +
    callbackInput.status +
    callbackInput.totalAmount
  )
  .digest("base64")

assertEqual("döküman callback formülüne birebir eşleşme", cbHash1, cbManual)

// Token hash ile FARKLI olduğunu doğrula (iki formül farklı)
assert("token hash ≠ callback hash (farklı formüller)", token1 !== cbHash1)

// ─── Test 6: verifyCallbackHash ──────────────────────────────────
console.log("\n=== 6. verifyCallbackHash ===")

assert("doğru hash → kabul", verifyCallbackHash(cbHash1, callbackInput))
assert("yanlış hash → red", !verifyCallbackHash("YANLISH_HASH", callbackInput))
assert(
  "farklı status → red",
  !verifyCallbackHash(cbHash1, { ...callbackInput, status: "failed" })
)
assert(
  "farklı total_amount → red",
  !verifyCallbackHash(cbHash1, { ...callbackInput, totalAmount: "99999" })
)
assert(
  "farklı merchant_oid → red",
  !verifyCallbackHash(cbHash1, { ...callbackInput, merchantOid: "FAKEORDER" })
)

// failed status için ayrı hash
const cbHashFail = computeCallbackHash({ ...callbackInput, status: "failed" })
assert("failed status hash kabul", verifyCallbackHash(cbHashFail, { ...callbackInput, status: "failed" }))
assert("failed hash success için geçersiz", !verifyCallbackHash(cbHashFail, callbackInput))
assert(
  "kısa hash (uzunluk ≠) red",
  !verifyCallbackHash("abc", callbackInput)
)
assert(
  "uzun hash (uzunluk ≠) red",
  !verifyCallbackHash(cbHash1 + "x", callbackInput)
)
const verifySrc = readFileSync(join(__dirname, "../modules/paytr/hash.ts"), "utf8")
const verifyFn = verifySrc.slice(
  verifySrc.indexOf("export function verifyCallbackHash"),
  verifySrc.indexOf("export type RefundHashInput")
)
assert("timingSafeEqual kullanır", verifyFn.includes("timingSafeEqual"))
assert("uzunluk eşit değilse red", verifyFn.includes("a.length !== b.length"))
assert(
  "hash string === yok",
  !/incoming\s*===\s*expected/.test(verifyFn) &&
    !verifyFn.includes("incoming === expected")
)

// ─── Test 7: computeRefundHash + formatPaytrReturnAmount ─────────
console.log("\n=== 7. computeRefundHash + formatPaytrReturnAmount (iade) ===")

assertEqual("199.9 → 199.90", formatPaytrReturnAmount(199.9), "199.90")
assertEqual("10 → 10.00", formatPaytrReturnAmount(10), "10.00")
assertEqual("string 50.5", formatPaytrReturnAmount("50.5"), "50.50")
assertEqual("float drift 19.9", formatPaytrReturnAmount(19.9), "19.90")

let threw = false
try {
  formatPaytrReturnAmount(0)
} catch {
  threw = true
}
assert("0 tutar hata", threw)

const refundInput = {
  merchantId: "TEST_MERCHANT",
  merchantOid: "MORDER001",
  returnAmount: "199.90",
  merchantSalt: "TEST_SALT",
  merchantKey: "TEST_KEY",
}

const refundToken1 = computeRefundHash(refundInput)
const refundToken2 = computeRefundHash(refundInput)
console.log(`  refund paytr_token: ${refundToken1}`)
assert("base64 formatı", /^[A-Za-z0-9+/]+=*$/.test(refundToken1))
assertEqual("deterministic", refundToken1, refundToken2)

const refundManual = crypto
  .createHmac("sha256", refundInput.merchantKey)
  .update(
    refundInput.merchantId +
      refundInput.merchantOid +
      refundInput.returnAmount +
      refundInput.merchantSalt
  )
  .digest("base64")
assertEqual("döküman iade formülüne birebir eşleşme", refundToken1, refundManual)
assert(
  "iade hash ≠ token hash (farklı formüller)",
  refundToken1 !== token1
)

const refA = buildRefundReferenceNo("MORDER001", "50.00", 0)
const refB = buildRefundReferenceNo("MORDER001", "50.00", 0)
const refC = buildRefundReferenceNo("MORDER001", "50.00", 1)
assertEqual("reference deterministic", refA, refB)
assert("prior count → farklı reference", refA !== refC)
assert("reference alfanumerik", /^[a-zA-Z0-9]+$/.test(refA))
assert("reference max 64", refA.length <= 64)

// ─── Test 8: Idempotency simülasyonu ─────────────────────────────
console.log("\n=== 8. İdempotency Simülasyonu ===")

// callback_processed flag mantığını test et
const sessionData: Record<string, unknown> = {
  session_id: "sess_001",
  merchant_oid: "MORDER001",
  paytr_status: "pending",
  callback_processed: false,
}

function simulateCallbackProcess(data: Record<string, unknown>, cbStatus: string): boolean {
  if (data.callback_processed === true) {
    return false // tekrar işleme
  }
  data.paytr_status = cbStatus === "success" ? "success" : "failed"
  data.callback_processed = true
  return true // ilk kez işlendi
}

const firstCall = simulateCallbackProcess(sessionData, "success")
const secondCall = simulateCallbackProcess(sessionData, "success")
const thirdCall = simulateCallbackProcess(sessionData, "success")

assert("ilk callback işlendi", firstCall)
assert("ikinci callback tekrar işlenmedi (idempotency)", !secondCall)
assert("üçüncü callback de tekrar işlenmedi", !thirdCall)
assertEqual("status doğru set edildi", sessionData.paytr_status, "success")

// refund local idempotency: aynı reference success kaydı → tekrar API yok
const refunds: { reference_no: string; return_amount: string; status: string }[] = []
const amt = "50.00"
const ref = buildRefundReferenceNo("MORDER001", amt, refunds.length)
function simulateRefundOnce(): "api" | "skip" {
  const hit = refunds.find(
    (r) => r.reference_no === ref && r.return_amount === amt && r.status === "success"
  )
  if (hit) return "skip"
  refunds.push({ reference_no: ref, return_amount: amt, status: "success" })
  return "api"
}
assertEqual("ilk refund API", simulateRefundOnce(), "api")
assertEqual("ikinci refund skip", simulateRefundOnce(), "skip")

console.log("\n=== 9. callback tutar vs session ===")
assertEqual("199.90 → 19990 kuruş", sessionAmountToKurus(199.9), 19990)
assert("eşleşme", callbackAmountMatchesSession("19990", 199.9))
assert("1 kuruş tolerans", callbackAmountMatchesSession("19991", 199.9))
assert("50 kuruş sapma red", !callbackAmountMatchesSession("20040", 199.9))
assert("0/negatif red", !callbackAmountMatchesSession("0", 199.9))

console.log("\n=== 10. güvenlik sözleşmesi ===")
assert(
  "boş hash red",
  !verifyCallbackHash("", {
    merchantOid: "M1",
    merchantSalt: "s",
    status: "success",
    totalAmount: "100",
    merchantKey: "k",
  })
)
const svc = readFileSync(join(__dirname, "../modules/paytr/service.ts"), "utf8")
assert("debug_on sabit 1 değil", !svc.includes('form.append("debug_on", "1")'))
assert("debug_on getter", svc.includes("this.debugOn"))
const mw = readFileSync(join(__dirname, "../api/middlewares.ts"), "utf8")
assert("callback rate-limit bağlı", mw.includes("paytrCallbackRateLimit"))

// ─── Sonuç ───────────────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`)
console.log(`Toplam: ${passed + failed} test — ✓ ${passed} başarılı, ✗ ${failed} başarısız`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log("Tüm testler geçti!")
}
