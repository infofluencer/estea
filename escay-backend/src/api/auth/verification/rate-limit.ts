import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * In-memory rate limit for verification email resend.
 * TODO(prod): replace with Redis shared limiter across replicas.
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

const hits = new Map<string, number[]>()

function clientKey(req: MedusaRequest): string {
  const forwarded = req.headers["x-forwarded-for"]
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0] : undefined)?.trim() ||
    req.ip ||
    "unknown"
  const authContext = (req as MedusaRequest & {
    auth_context?: { auth_identity_id?: string }
  }).auth_context
  const authId = authContext?.auth_identity_id
    ? String(authContext.auth_identity_id)
    : "anon"
  return `${ip}:${authId}`
}

export function verificationRequestRateLimit(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const key = clientKey(req)
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS)

  if (recent.length >= MAX_ATTEMPTS) {
    hits.set(key, recent)
    res.status(429).json({
      type: "rate_limit",
      message:
        "Çok fazla doğrulama talebi. Lütfen birkaç dakika sonra tekrar deneyin.",
    })
    return
  }

  recent.push(now)
  hits.set(key, recent)
  next()
}
