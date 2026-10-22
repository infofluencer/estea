/**
 * Customer-facing order number helpers.
 * Medusa `display_id` stays 1, 2, 3… — UI shows BASE + display_id (e.g. #100003).
 */

export const ORDER_NUMBER_BASE = 100_000

export type ParsedOrderNumber =
  | { kind: "order_id"; orderId: string }
  | { kind: "display_id"; displayId: number }
  | { kind: "invalid" }

/** Format Medusa display_id for UI/email: 3 → "100003" (caller adds #). */
export function formatOrderNumber(
  displayId: number | string | null | undefined
): string | null {
  if (displayId == null || displayId === "") return null
  const n = typeof displayId === "number" ? displayId : Number(String(displayId).trim())
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return null
  return String(ORDER_NUMBER_BASE + n)
}

/**
 * Parse user input from tracking form / deep links.
 * Accepts: "#100003", "100003", "3", "#3", "order_01…"
 */
export function parseOrderNumber(raw: string): ParsedOrderNumber {
  const cleaned = String(raw || "")
    .trim()
    .replace(/^#+/, "")
    .trim()

  if (!cleaned) return { kind: "invalid" }

  if (/^order_/i.test(cleaned)) {
    return { kind: "order_id", orderId: cleaned }
  }

  if (!/^\d+$/.test(cleaned)) {
    return { kind: "invalid" }
  }

  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 1) return { kind: "invalid" }

  // 6-digit customer format (≥ BASE) → strip base; plain display_id otherwise
  if (n >= ORDER_NUMBER_BASE) {
    const displayId = n - ORDER_NUMBER_BASE
    if (displayId < 1) return { kind: "invalid" }
    return { kind: "display_id", displayId }
  }

  return { kind: "display_id", displayId: n }
}

/** Prefer formatted display_id; fall back to custom_display_id then id suffix. */
export function resolveOrderNumberLabel(order: {
  display_id?: number | string | null
  custom_display_id?: string | null
  id: string
}): string {
  const formatted = formatOrderNumber(order.display_id)
  if (formatted) return formatted
  if (order.custom_display_id?.trim()) return order.custom_display_id.trim()
  return order.id.slice(-8)
}
