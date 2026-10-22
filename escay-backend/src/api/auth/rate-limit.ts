import { createRateLimiter } from "../store/_rate-limit"

/**
 * Customer auth brute-force / spam limits (in-memory, per IP).
 * TODO(prod): Redis shared limiter across replicas.
 *
 * Paths (Medusa v2):
 *  - POST /auth/customer/emailpass              → login
 *  - POST /auth/customer/emailpass/register     → register
 *  - POST /auth/customer/emailpass/reset-password → forgot (mail)
 *  - POST /auth/customer/emailpass/update       → reset with token
 */

const AUTH_MSG =
  "Çok fazla deneme. Lütfen birkaç dakika sonra tekrar deneyin."

export const authLoginRateLimit = createRateLimiter({
  name: "auth-login",
  maxAttempts: Number(process.env.AUTH_LOGIN_RATE_MAX || 10),
  windowMs: Number(process.env.AUTH_LOGIN_RATE_WINDOW_MS || 10 * 60 * 1000),
  message: AUTH_MSG,
})

export const authRegisterRateLimit = createRateLimiter({
  name: "auth-register",
  maxAttempts: Number(process.env.AUTH_REGISTER_RATE_MAX || 10),
  windowMs: Number(process.env.AUTH_REGISTER_RATE_WINDOW_MS || 10 * 60 * 1000),
  message: AUTH_MSG,
})

/** Forgot-password email spam — tighter than login. */
export const authPasswordResetRequestRateLimit = createRateLimiter({
  name: "auth-password-reset-request",
  maxAttempts: Number(process.env.AUTH_PASSWORD_RESET_RATE_MAX || 5),
  windowMs: Number(
    process.env.AUTH_PASSWORD_RESET_RATE_WINDOW_MS || 10 * 60 * 1000
  ),
  message: AUTH_MSG,
})

/** Complete reset with token — same tight bucket name separately. */
export const authPasswordUpdateRateLimit = createRateLimiter({
  name: "auth-password-update",
  maxAttempts: Number(process.env.AUTH_PASSWORD_UPDATE_RATE_MAX || 5),
  windowMs: Number(
    process.env.AUTH_PASSWORD_UPDATE_RATE_WINDOW_MS || 10 * 60 * 1000
  ),
  message: AUTH_MSG,
})
