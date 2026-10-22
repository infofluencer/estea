import { cookieSecureFlag } from "../cookie-secure"

export const AUTH_COOKIE = "_escay_jwt"

/**
 * Short-lived actorless JWT used only to request email verification resends.
 * Not a full customer session — cannot access /store/customers/me.
 */
export const VERIFY_COOKIE = "_escay_verify_jwt"

/** Short-lived: guest confirmation page can call order lookup. */
export const LAST_ORDER_EMAIL_COOKIE = "_escay_last_order_email"
export const LAST_ORDER_ID_COOKIE = "_escay_last_order_id"

export const LAST_ORDER_COOKIE_MAX_AGE = 60 * 60 * 24 // 24h

export const LAST_ORDER_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: cookieSecureFlag(),
  maxAge: LAST_ORDER_COOKIE_MAX_AGE,
}

export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
export const VERIFY_COOKIE_MAX_AGE = 60 * 60 * 24 // 24h — matches verification token TTL

export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderildi."

export const UNVERIFIED_LOGIN_MESSAGE =
  "Hesabınız doğrulanmamış. E-postanıza gönderilen bağlantıya tıklayın."

export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: cookieSecureFlag(),
  maxAge: AUTH_COOKIE_MAX_AGE,
}

export const VERIFY_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: cookieSecureFlag(),
  maxAge: VERIFY_COOKIE_MAX_AGE,
}

/**
 * Storefront password policy (register + reset). Medusa emailpass only checks
 * non-empty; we enforce min length on the form/action layer for security.
 */
export const AUTH_PASSWORD_MIN_LENGTH = 8

export function authPasswordTooShortMessage(min = AUTH_PASSWORD_MIN_LENGTH) {
  return `Şifre en az ${min} karakter olmalıdır.`
}
