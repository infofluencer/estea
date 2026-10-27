import { createRateLimiter } from "../../store/_rate-limit"

/**
 * Auth'suz callback — sahte flood'u kes, PayTR retry + yerel simülasyonu boğma.
 * Varsayılan: 180 istek / 60 sn / IP (Script B ~15 POST, PayTR birkaç retry).
 */
export const paytrCallbackRateLimit = createRateLimiter({
  name: "paytr-callback",
  maxAttempts: Number(process.env.PAYTR_CALLBACK_RATE_MAX || 180),
  windowMs: Number(process.env.PAYTR_CALLBACK_RATE_WINDOW_MS || 60 * 1000),
  message: "Too many requests.",
})
