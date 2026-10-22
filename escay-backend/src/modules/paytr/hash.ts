import crypto from "crypto"

// ─────────────────────────────────────────────────────────────────
// merchant_oid helpers
// ─────────────────────────────────────────────────────────────────

/**
 * PayTR merchant_oid kuralları:
 *  - en fazla 64 karakter
 *  - yalnızca alfanumerik
 *
 * Medusa payment session ID'si "payses_01ABC..." biçiminde "_" içerir.
 * Strateji: prefix "M" + hex(sha256(sessionId)).slice(0,24) = 25 char,
 * geri izleme için orijinal sessionId payment session data'sında saklanır.
 *
 * Alternatif kısa format (session ID "_" çıkarılmış, 26 char):
 *   "M" + sessionId.replace(/_/g, "").slice(0, 30)
 * → deterministic, ters çevrilebilir değil ama sessionId session data'dan okunur.
 */
export function buildMerchantOid(
  sessionId: string,
  prefix: string = paytrOidPrefix() || "M"
): string {
  // Remove non-alphanumeric characters, prepend prefix, cap at 64 chars
  const clean = sessionId.replace(/[^a-zA-Z0-9]/g, "")
  return (prefix + clean).slice(0, 64)
}

/**
 * PAYTR_OID_PREFIX (ör. "STG") — canlı dışı ortam işareti.
 * Doluysa merchant_oid bu önekle başlar ve gerçek PayTR istekleri
 * yalnızca test_mode=1 ile atılabilir (bkz. service.ts).
 */
export function paytrOidPrefix(): string {
  return (process.env.PAYTR_OID_PREFIX || "").replace(/[^a-zA-Z0-9]/g, "")
}

/**
 * merchant_oid'den sessionId geri çözümlenemez (hash lossy).
 * sessionId her zaman payment session data['session_id'] üzerinden okunur.
 */

// ─────────────────────────────────────────────────────────────────
// Türkçe karakter temizleme (email için)
// ─────────────────────────────────────────────────────────────────

const TR_MAP: Record<string, string> = {
  ş: "s", Ş: "S", ğ: "g", Ğ: "G", ı: "i", İ: "I",
  ö: "o", Ö: "O", ü: "u", Ü: "U", ç: "c", Ç: "C",
}

/** PayTR email alanı Türkçe karakter kabul etmez — ASCII'ye çevir */
export function sanitizeEmail(email: string): string {
  return email
    .split("")
    .map((c) => TR_MAP[c] ?? c)
    .join("")
}

// ─────────────────────────────────────────────────────────────────
// ADIM 1 — get-token isteği için paytr_token
// ─────────────────────────────────────────────────────────────────

export type TokenHashInput = {
  merchantId: string
  userIp: string
  merchantOid: string
  email: string           // Türkçe karakter olmadan
  paymentAmount: number   // kuruş (TL × 100, tamsayı)
  userBasket: string      // base64(JSON([...]))
  noInstallment: string   // "0" or "1"
  maxInstallment: string  // "0"–"12"
  currency: string        // "TL"
  testMode: string        // "0" or "1"
  merchantSalt: string
  merchantKey: string
}

/**
 * Token hash (Adım 1):
 * hash_str = merchantId + userIp + merchantOid + email + paymentAmount
 *            + userBasket + noInstallment + maxInstallment + currency + testMode
 * paytr_token = base64(HMAC_SHA256(hash_str + merchantSalt, merchantKey))
 */
export function computeTokenHash(input: TokenHashInput): string {
  const {
    merchantId, userIp, merchantOid, email, paymentAmount,
    userBasket, noInstallment, maxInstallment, currency, testMode,
    merchantSalt, merchantKey,
  } = input

  const hashStr =
    merchantId +
    userIp +
    merchantOid +
    email +
    String(paymentAmount) +
    userBasket +
    noInstallment +
    maxInstallment +
    currency +
    testMode

  return crypto
    .createHmac("sha256", merchantKey)
    .update(hashStr + merchantSalt)
    .digest("base64")
}

// ─────────────────────────────────────────────────────────────────
// ADIM 2 — callback hash doğrulama
// ─────────────────────────────────────────────────────────────────

export type CallbackHashInput = {
  merchantOid: string
  merchantSalt: string
  status: string       // "success" | "failed"
  totalAmount: string  // string olarak gelir
  merchantKey: string
}

/**
 * Callback hash (Adım 2):
 * paytr_token = merchantOid + merchantSalt + status + totalAmount
 * hash = base64(HMAC_SHA256(paytr_token, merchantKey))
 *
 * NOT: hash_str formülü Adım 1'den FARKLIDIR.
 */
export function computeCallbackHash(input: CallbackHashInput): string {
  const { merchantOid, merchantSalt, status, totalAmount, merchantKey } = input

  const paytrToken = merchantOid + merchantSalt + status + totalAmount

  return crypto
    .createHmac("sha256", merchantKey)
    .update(paytrToken)
    .digest("base64")
}

/**
 * Gelen callback hash'ini doğrular.
 * false → "bad hash" → işleme alma.
 *
 * Karşılaştırma timing-safe (crypto.timingSafeEqual). Formül değişmez.
 * Uzunluklar eşit değilse eşitlik yok sayılır — timingSafeEqual eşit uzunluk ister.
 */
export function verifyCallbackHash(
  incoming: string,
  params: Omit<CallbackHashInput, "merchantKey"> & { merchantKey: string }
): boolean {
  const expected = computeCallbackHash(params)
  const a = Buffer.from(typeof incoming === "string" ? incoming : "", "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length) {
    return false
  }
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────
// ADIM 3 — iade (/odeme/iade) paytr_token
// ─────────────────────────────────────────────────────────────────

export type RefundHashInput = {
  merchantId: string
  merchantOid: string
  /** PayTR return_amount string — TL, nokta ayraçlı (ör. "199.90") */
  returnAmount: string
  merchantSalt: string
  merchantKey: string
}

/**
 * İade hash (Adım 3 — /odeme/iade):
 * hash_str = merchant_id + merchant_oid + return_amount + merchant_salt
 * paytr_token = base64(HMAC_SHA256(hash_str, merchant_key))
 *
 * NOT: get-token formülünden farklıdır (salt hash_str içinde; HMAC mesajına
 * ayrıca eklenmez).
 */
export function computeRefundHash(input: RefundHashInput): string {
  const { merchantId, merchantOid, returnAmount, merchantSalt, merchantKey } =
    input

  const hashStr = merchantId + merchantOid + returnAmount + merchantSalt

  return crypto
    .createHmac("sha256", merchantKey)
    .update(hashStr)
    .digest("base64")
}

/** Session major-unit TRY → kuruş tamsayı (callback total_amount ile karşılaştırma). */
export function sessionAmountToKurus(amount: unknown): number | null {
  let n: number
  if (typeof amount === "number") n = amount
  else if (typeof amount === "string") n = Number(amount)
  else if (amount != null && typeof amount === "object" && "value" in amount) {
    n = Number((amount as { value: unknown }).value)
  } else {
    n = Number(amount)
  }
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/**
 * Callback total_amount (kuruş string) session tutarıyla örtüşüyor mu?
 * 1 kuruş tolerans (yuvarlama).
 */
export function callbackAmountMatchesSession(
  callbackKurus: string,
  sessionAmount: unknown,
  toleranceKurus = 1
): boolean {
  const incoming = Number(callbackKurus)
  const expected = sessionAmountToKurus(sessionAmount)
  if (!Number.isFinite(incoming) || incoming <= 0 || expected == null || expected <= 0) {
    return false
  }
  return Math.abs(incoming - expected) <= toleranceKurus
}

/**
 * Medusa major-unit TRY tutarını PayTR iade API'sinin beklediği
 * return_amount string'ine çevirir (ör. 199.9 → "199.90").
 *
 * ÖNEMLİ: get-token payment_amount kuruş (×100) ister; /odeme/iade ise
 * TL + nokta ayraç ister. Medusa amount her iki yerde de major-unit TRY'dir.
 */
export function formatPaytrReturnAmount(amount: unknown): string {
  let n: number
  if (typeof amount === "number") {
    n = amount
  } else if (typeof amount === "string") {
    n = Number(amount)
  } else if (amount != null && typeof amount === "object" && "value" in amount) {
    n = Number((amount as { value: unknown }).value)
  } else if (amount != null && typeof (amount as { toString?: () => string }).toString === "function") {
    n = Number(String(amount))
  } else {
    n = Number(amount)
  }

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Geçersiz iade tutarı: ${String(amount)}`)
  }

  // Kuruş hassasiyetine yuvarla, sonra TL string üret
  // (float drift: 19.9 * 100 → 1989.999… → Math.round → 1990 → "19.90")
  const kurus = Math.round(n * 100)
  return (kurus / 100).toFixed(2)
}

/**
 * Idempotent reference_no (PayTR: max 64, alfanumerik).
 * Aynı merchant_oid + tutar + önceki başarılı iade sayısı → aynı referans.
 */
export function buildRefundReferenceNo(
  merchantOid: string,
  returnAmount: string,
  priorSuccessCount: number
): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${merchantOid}|${returnAmount}|${priorSuccessCount}`)
    .digest("hex")
    .slice(0, 28)
  return (`R${priorSuccessCount}${digest}`).replace(/[^a-zA-Z0-9]/g, "").slice(0, 64)
}

// ─────────────────────────────────────────────────────────────────
// user_basket builder
// ─────────────────────────────────────────────────────────────────

export type BasketItem = {
  name: string        // ürün adı (max ~100 char önerilir)
  unitPrice: number   // TL cinsinden (ör: 1499 → "1499.00")
  quantity: number
}

/**
 * PayTR user_basket = base64(JSON([[isim, birim_fiyat_str, adet], ...]))
 * Birim fiyat string olarak "1499.00" formatında gönderilir.
 */
export function buildUserBasket(items: BasketItem[]): string {
  const arr = items.map((i) => [
    i.name.slice(0, 100),
    i.unitPrice.toFixed(2),
    i.quantity,
  ])
  return Buffer.from(JSON.stringify(arr)).toString("base64")
}
