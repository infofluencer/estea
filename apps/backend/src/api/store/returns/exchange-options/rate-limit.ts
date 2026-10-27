import { createRateLimiter } from "../../_rate-limit"

/** Değişim seçenekleri — kendi kovası (sipariş sorgulamayla paylaşılmaz). */
export const exchangeOptionsRateLimit = createRateLimiter({
  name: "exchange-options",
  maxAttempts: Number(process.env.EXCHANGE_OPTIONS_RATE_MAX || 30),
  windowMs: Number(process.env.EXCHANGE_OPTIONS_RATE_WINDOW_MS || 10 * 60 * 1000),
})
