/**
 * E-posta doğrulama bağlantısı: "son gönderilen geçerli kalır".
 *
 * Medusa'nın token sağlayıcısı her istekte token'ı yeniler ve öncekini geçersiz
 * kılar. Storefront da her giriş denemesinde mail ister. Sonuç: müşteri tekrar
 * giriş deneyince elindeki mailin bağlantısı ölür ("geçersiz veya kullanılmış";
 * Mareen'de 05.11'de yaşandı).
 *
 * Kural:
 *  - Giriş/kayıt (otomatik istek): gönderilmiş ve hâlâ geçerli bağlantı varsa yenisi üretilmez.
 *  - "Tekrar gönder" (kullanıcı isteği): yeni bağlantı üretir, COOLDOWN'da bir.
 */

/** Bu süre içinde hiçbir istek yeni bağlantı üretmez (çift tıklama, art arda giriş). */
export const VERIFICATION_RESEND_COOLDOWN_MS = 2 * 60_000

/** medusa-config ttl_seconds = 24 saat; bitmesine yakın bağlantıyı korumak için 1 saat pay. */
export const VERIFICATION_KEEP_LINK_MS = 23 * 60 * 60_000

/** Storefront'un otomatik (giriş/kayıt kaynaklı) isteklerde gönderdiği başlık. */
export const VERIFICATION_AUTO_HEADER = "x-escay-verification-auto"

export type VerificationDecision =
  | { action: "issue" }
  | { action: "keep"; reason: "verified" | "cooldown" | "link_still_valid"; retryAfterMs: number }

export function decideVerificationRequest(input: {
  verification?: { requested_at?: Date | string | null; verified_at?: Date | string | null } | null
  /** Giriş/kayıt kaynaklı istek mi ("Tekrar gönder" değil). */
  auto: boolean
  /** Son bağlantının maili gönderilmiş ya da gönderilmekte mi. */
  mailOnRecord: boolean
  now: Date
}): VerificationDecision {
  const { verification, auto, mailOnRecord, now } = input
  if (!verification) return { action: "issue" }
  if (verification.verified_at) {
    return { action: "keep", reason: "verified", retryAfterMs: 0 }
  }
  if (!verification.requested_at) return { action: "issue" }

  const ageMs = now.getTime() - new Date(verification.requested_at).getTime()
  if (ageMs < VERIFICATION_RESEND_COOLDOWN_MS) {
    return {
      action: "keep",
      reason: "cooldown",
      retryAfterMs: VERIFICATION_RESEND_COOLDOWN_MS - Math.max(0, ageMs),
    }
  }
  if (auto && mailOnRecord && ageMs < VERIFICATION_KEEP_LINK_MS) {
    return { action: "keep", reason: "link_still_valid", retryAfterMs: 0 }
  }
  return { action: "issue" }
}
