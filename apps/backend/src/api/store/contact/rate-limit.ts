import { createRateLimiter } from "../_rate-limit"

/** Contact form rate limit — own bucket (not shared with order-lookup). */
export const contactRateLimit = createRateLimiter({
  name: "contact",
  maxAttempts: 12,
  windowMs: 10 * 60 * 1000,
})
