import { createRateLimiter } from "../_rate-limit"

export const paytrCheckoutRegisterRateLimit = createRateLimiter({
  name: "paytr-checkout-register",
  maxAttempts: Number(process.env.PAYTR_CHECKOUT_RATE_MAX || 30),
  windowMs: 10 * 60 * 1000,
})

/** Sonuç sayfası 2 sn'de bir sorar. */
export const paytrCheckoutStatusRateLimit = createRateLimiter({
  name: "paytr-checkout-status",
  maxAttempts: Number(process.env.PAYTR_CHECKOUT_STATUS_RATE_MAX || 120),
  windowMs: 5 * 60 * 1000,
})
