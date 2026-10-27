import type { StagingEnv } from "./env"

export type HttpResult = {
  status: number
  body: unknown
  raw: string
  headers: Headers
}

export async function rawFetch(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<HttpResult> {
  const res = await fetch(url, init)
  const raw = await res.text()
  let body: unknown = null
  try {
    body = raw ? JSON.parse(raw) : null
  } catch {
    body = raw
  }
  return { status: res.status, body, raw, headers: res.headers }
}

export async function storeFetch(
  env: StagingEnv,
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-publishable-api-key": env.publishableKey,
    ...(init.headers as Record<string, string> | undefined),
  }
  return rawFetch(`${env.backendUrl}${path}`, { ...init, headers })
}

export async function adminFetch(
  env: StagingEnv,
  token: string,
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {}
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  }
  return rawFetch(`${env.backendUrl}${path}`, { ...init, headers })
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

export function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {}
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}
