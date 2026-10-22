/**
 * PayTR iframe_token — path / redirect için güvenli karakter seti.
 * Kart verisi değil; yalnızca get-token yanıtındaki token.
 */
export const PAYTR_IFRAME_TOKEN_RE = /^[A-Za-z0-9_-]{8,200}$/

export function isSafePaytrIframeToken(
  token: string | null | undefined
): token is string {
  return typeof token === "string" && PAYTR_IFRAME_TOKEN_RE.test(token)
}
