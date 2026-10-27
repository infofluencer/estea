import { MedusaError } from "@medusajs/framework/utils"

/** Same generic 404 for missing order, wrong owner, and wrong email — do not leak existence. */
export const ORDER_NOT_FOUND = "Order not found"

export function orderNotFound(): never {
  throw new MedusaError(MedusaError.Types.NOT_FOUND, ORDER_NOT_FOUND)
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value)
  return Boolean(email) && EMAIL_RE.test(email)
}

/** Query fields for guest lookup: totals + relation expansions. */
export const STORE_ORDER_RETRIEVE_FIELDS = [
  "id",
  "status",
  "summary",
  "currency_code",
  "display_id",
  "custom_display_id",
  "region_id",
  "email",
  "total",
  "subtotal",
  "tax_total",
  "discount_total",
  "item_total",
  "item_subtotal",
  "original_item_total",
  "shipping_total",
  "created_at",
  "updated_at",
  "items.*",
  "items.tax_lines.*",
  "items.adjustments.*",
  "items.detail.*",
  "items.variant.*",
  "items.variant.product.*",
  "shipping_address.*",
  "billing_address.*",
  "shipping_methods.*",
  "shipping_methods.tax_lines.*",
  "shipping_methods.adjustments.*",
  "payment_collections.*",
  "credit_lines.*",
  "fulfillments.*",
  "fulfillments.labels.*",
  "fulfillments.items.*",
  "returns.*",
]
