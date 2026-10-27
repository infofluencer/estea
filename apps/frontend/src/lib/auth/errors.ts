import { FetchError } from "@medusajs/js-sdk"

export function errMessage(e: unknown, fallback: string) {
  if (e instanceof FetchError) {
    return e.message.trim() || fallback
  }
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === "string" && m.trim()) return m
  }
  return fallback
}
