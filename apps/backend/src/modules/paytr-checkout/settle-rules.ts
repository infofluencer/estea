/**
 * Başarılı PayTR ödemesinde ne yapılacağına karar veren saf kurallar
 * (Medusa import'u yok; birim testlenebilir).
 */

export type CheckoutItem = { variant_id: string; quantity: number }

export type PaytrCheckoutStatus =
  | "pending"
  | "paid"
  | "completed"
  | "review"
  | "refunded"
  | "expired"

export type PaytrReviewKind =
  | "amount_mismatch"
  | "currency_mismatch"
  | "duplicate_payment"
  | "cart_changed"
  | "order_canceled"

export type SettleInput = {
  status: PaytrCheckoutStatus
  /** Ödenen tutar, denemenin tutarıyla örtüşüyor mu */
  amountMatches: boolean
  /** Ödenen para birimi denemeninkiyle aynı mı (bildirim birim vermediyse true) */
  currencyMatches: boolean
  cartExists: boolean
  /** Sepetten oluşmuş sipariş */
  cartOrderId: string | null
  /** O sipariş iptal edilmiş mi (para alınmış siparişe tahsilat yazılmaz) */
  cartOrderCanceled: boolean
  /** Bu numaranın ödeme oturumu sepette hâlâ duruyor mu */
  sessionAlive: boolean
  /** Sepetin güncel tutarı denemeyle aynı mı */
  cartAmountMatches: boolean
  /** Sepetin ürünleri denemeyle aynı mı */
  itemsMatch: boolean
}

export type SettleDecision =
  | { action: "noop" }
  | { action: "review"; kind: PaytrReviewKind }
  /** Sipariş oluştur + tahsil et. adopt: oturum silinmiş, bu numarayla yeniden açılır */
  | { action: "complete"; adopt: boolean }
  /** Sipariş var, yalnız tahsilat eksik */
  | { action: "capture" }

export function decideSettlement(input: SettleInput): SettleDecision {
  if (
    input.status === "completed" ||
    input.status === "refunded" ||
    input.status === "review"
  ) {
    return { action: "noop" }
  }
  if (!input.currencyMatches) return { action: "review", kind: "currency_mismatch" }
  if (!input.amountMatches) return { action: "review", kind: "amount_mismatch" }

  if (input.cartOrderId) {
    // Sipariş açılmış ama sonradan iptal edilmişse tahsilat yazılmaz; para elle çözülür.
    if (input.cartOrderCanceled) return { action: "review", kind: "order_canceled" }
    // Yeni oturum eskisini siler: oturumu duruyorsa sipariş bu ödemeden oluşmuştur.
    // Durmuyorsa sepet başka numarayla ödenmiş, müşteri iki kez ödemiştir.
    return input.sessionAlive
      ? { action: "capture" }
      : { action: "review", kind: "duplicate_payment" }
  }

  if (!input.cartExists || !input.cartAmountMatches || !input.itemsMatch) {
    return { action: "review", kind: "cart_changed" }
  }
  return { action: "complete", adopt: !input.sessionAlive }
}

/**
 * PayTR para birimi kodu ("TL", "TRY", "USD"…) → Medusa kodu ("try", "usd").
 * Boş/yok → null (bildirim birim vermemiş; karşılaştırma yapılmaz).
 */
export function normalizePaytrCurrency(code: unknown): string | null {
  const c = typeof code === "string" ? code.trim().toUpperCase() : ""
  if (!c) return null
  if (c === "TL" || c === "TRY" || c === "TRL") return "try"
  return c.toLowerCase()
}

export function currencyMatches(paid: unknown, expected: string | null | undefined): boolean {
  const p = normalizePaytrCurrency(paid)
  if (p == null) return true
  return p === normalizePaytrCurrency(expected || "try")
}

/** Sıra ve satır bölünmesinden bağımsız sepet imzası. */
export function itemsSignature(
  items: { variant_id?: string | null; quantity?: unknown }[] | null | undefined
): string {
  const totals = new Map<string, number>()
  for (const item of items || []) {
    if (!item?.variant_id) continue
    totals.set(item.variant_id, (totals.get(item.variant_id) || 0) + (Number(item.quantity) || 0))
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, qty]) => `${id}:${qty}`)
    .join("|")
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** İlk sorgudan önce bekleme: normal callback'e yol ver. */
export const POLL_MIN_AGE_MS = 3 * MINUTE
/** Bu süreden eski ödenmemiş deneme sorgulanmaz (geç callback yine işlenir). */
export const POLL_MAX_AGE_MS = 48 * HOUR
/** Bu süre içinde sipariş oluşmazsa ödenmiş deneme elle incelemeye düşer. */
export const PAID_RETRY_MAX_AGE_MS = 72 * HOUR

/** Açık denemenin bu turda PayTR'ye sorulması gerekiyor mu? İlk 2 saat her tur, sonra saatte bir. */
export function isPollDue(createdAt: Date, lastPolledAt: Date | null, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime()
  if (age < POLL_MIN_AGE_MS || age > POLL_MAX_AGE_MS) return false
  if (!lastPolledAt || age <= 2 * HOUR) return true
  return now.getTime() - lastPolledAt.getTime() >= HOUR
}
