/**
 * HTTP helpers for hitting a live Medusa store API.
 * Env:
 *   MEDUSA_BACKEND_URL (default http://localhost:9000)
 *   MEDUSA_PUBLISHABLE_KEY or TEST_PUBLISHABLE_KEY
 */

export function backendUrl(): string {
  return (
    process.env.MEDUSA_BACKEND_URL ||
    process.env.TEST_BACKEND_URL ||
    "http://localhost:9000"
  ).replace(/\/$/, "")
}

export function publishableKey(): string {
  return (
    process.env.MEDUSA_PUBLISHABLE_KEY ||
    process.env.TEST_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
    ""
  )
}

export type HttpResult = {
  status: number
  body: unknown
  raw: string
  headers: Headers
}

export async function storeFetch(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<HttpResult> {
  const key = publishableKey()
  if (!key) {
    throw new Error(
      "MEDUSA_PUBLISHABLE_KEY / TEST_PUBLISHABLE_KEY gerekli (store istekleri)."
    )
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-publishable-api-key": key,
    ...(init.headers as Record<string, string> | undefined),
  }

  const res = await fetch(`${backendUrl()}${path}`, {
    ...init,
    headers,
  })

  const raw = await res.text()
  let body: unknown = null
  try {
    body = raw ? JSON.parse(raw) : null
  } catch {
    body = raw
  }

  return { status: res.status, body, raw, headers: res.headers }
}

export function bodyMessage(body: unknown): string {
  if (!body || typeof body !== "object") return String(body ?? "")
  const b = body as Record<string, unknown>
  if (typeof b.message === "string") return b.message
  if (Array.isArray(b.errors) && b.errors[0]) {
    const e = b.errors[0] as { message?: string }
    return e.message || JSON.stringify(b.errors[0])
  }
  return JSON.stringify(b)
}

/** Stable fingerprint for enumeration checks (status + normalized message). */
export function responseFingerprint(res: HttpResult): string {
  const msg = bodyMessage(res.body)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  return `${res.status}|${msg}`
}
