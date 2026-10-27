import { createRateLimiter } from "../../_rate-limit"

/**
 * Guest order lookup rate limit — own bucket (not shared with contact).
 * TODO(prod): replace with Redis / edge rate-limit.
 */
export const lookupRateLimit = createRateLimiter({
  name: "order-lookup",
  maxAttempts: Number(process.env.ORDER_LOOKUP_RATE_MAX || 30),
  windowMs: Number(process.env.ORDER_LOOKUP_RATE_WINDOW_MS || 10 * 60 * 1000),
})
