import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

/** Admin giriş ekranındaki "Beni hatırla" widget'ının yazdığı cookie. */
export const REMEMBER_COOKIE = "escay_admin_remember"
export const REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 gün

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const idx = part.indexOf("=")
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return null
}

/**
 * POST /auth/session (admin JWT → oturum cookie'si) öncesinde çalışır.
 * "Beni hatırla" işaretliyse bu oturumun süresini 7 güne çıkarır; değilse
 * medusa-config sessionOptions.ttl (12 saat) geçerli kalır. rolling: true
 * olduğundan süre her istekte yenilenir (express-session originalMaxAge'i
 * oturumla birlikte saklar).
 */
export function adminRememberMe(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const session = (req as { session?: { cookie?: { maxAge?: number | null } } })
    .session
  if (
    session?.cookie &&
    readCookie(req.headers.cookie, REMEMBER_COOKIE) === "1"
  ) {
    session.cookie.maxAge = REMEMBER_TTL_MS
  }
  next()
}
