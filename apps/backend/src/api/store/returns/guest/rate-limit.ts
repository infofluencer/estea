import { createRateLimiter } from "../../_rate-limit"

/** Guest return create — stricter than order-lookup (write path). */
export const guestReturnRateLimit = createRateLimiter({
  name: "guest-return",
  maxAttempts: Number(process.env.GUEST_RETURN_RATE_MAX || 8),
  windowMs: Number(process.env.GUEST_RETURN_RATE_WINDOW_MS || 10 * 60 * 1000),
})

/** Üye iade talebi — aynı sınır (IP başına). */
export const customerReturnRateLimit = createRateLimiter({
  name: "customer-return",
  maxAttempts: Number(process.env.GUEST_RETURN_RATE_MAX || 8),
  windowMs: Number(process.env.GUEST_RETURN_RATE_WINDOW_MS || 10 * 60 * 1000),
})
