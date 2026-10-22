/**
 * In-memory IP rate limiter factory.
 * Each createRateLimiter() call gets its own hits Map (isolated bucket).
 */

import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

function clientKey(req: MedusaRequest): string {
  const forwarded = req.headers["x-forwarded-for"]
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0] : undefined)?.trim() ||
    req.ip ||
    "unknown"
  return ip
}

export function createRateLimiter(options: {
  name: string
  maxAttempts: number
  windowMs: number
  /** Optional 429 body message (generic — do not include account identifiers). */
  message?: string
}) {
  const hits = new Map<string, number[]>()
  const { maxAttempts, windowMs, name } = options
  const message =
    options.message || "Too many requests. Try again later."

  return function rateLimit(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) {
    const key = `${name}:${clientKey(req)}`
    const now = Date.now()
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs)

    if (recent.length >= maxAttempts) {
      hits.set(key, recent)
      res.status(429).json({
        type: "rate_limit",
        message,
      })
      return
    }

    recent.push(now)
    hits.set(key, recent)
    next()
  }
}
