/**
 * Fixture env for live API suites.
 *
 * Required for guest-security / rate-limit / lifecycle against a running backend:
 *   TEST_ORDER_ID          — delivered order with returnable items
 *   TEST_ORDER_EMAIL       — matching email
 *   TEST_ORDER_ITEM_ID     — returnable line item id (orli_…)
 *   TEST_REASON_ID         — valid return_reason id
 *   TEST_REASON_DEFECT_ID  — seller_pays_shipping=true reason (optional)
 *   TEST_REASON_MIND_ID    — seller_pays_shipping=false reason (optional)
 *   TEST_WRONG_EMAIL       — email that does NOT match the order
 *   TEST_OTHER_ORDER_EMAIL — email of a different order (optional)
 *   MEDUSA_PUBLISHABLE_KEY
 *   MEDUSA_BACKEND_URL
 */

export type LiveFixture = {
  orderId: string
  email: string
  wrongEmail: string
  otherOrderEmail: string
  itemId: string
  reasonId: string
  reasonDefectId: string
  reasonMindId: string
  shippingTotal: number
  itemUnitPrice: number
}

export function requireLiveFixture(): LiveFixture {
  const orderId = process.env.TEST_ORDER_ID?.trim()
  const email = process.env.TEST_ORDER_EMAIL?.trim()
  const itemId = process.env.TEST_ORDER_ITEM_ID?.trim()
  const reasonId = process.env.TEST_REASON_ID?.trim()

  if (!orderId || !email || !itemId || !reasonId) {
    throw new Error(
      "Live fixture eksik. Gerekli: TEST_ORDER_ID, TEST_ORDER_EMAIL, TEST_ORDER_ITEM_ID, TEST_REASON_ID (+ publishable key)."
    )
  }

  return {
    orderId,
    email,
    wrongEmail:
      process.env.TEST_WRONG_EMAIL?.trim() || "definitely-wrong@example.invalid",
    otherOrderEmail:
      process.env.TEST_OTHER_ORDER_EMAIL?.trim() ||
      "other-customer@example.invalid",
    itemId,
    reasonId,
    reasonDefectId:
      process.env.TEST_REASON_DEFECT_ID?.trim() || reasonId,
    reasonMindId: process.env.TEST_REASON_MIND_ID?.trim() || reasonId,
    shippingTotal: Number(process.env.TEST_SHIPPING_TOTAL || 149.99),
    itemUnitPrice: Number(process.env.TEST_ITEM_UNIT_PRICE || 100),
  }
}

export function hasLiveFixture(): boolean {
  return Boolean(
    process.env.TEST_ORDER_ID &&
      process.env.TEST_ORDER_EMAIL &&
      process.env.TEST_ORDER_ITEM_ID &&
      process.env.TEST_REASON_ID &&
      (process.env.MEDUSA_PUBLISHABLE_KEY ||
        process.env.TEST_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)
  )
}
