/**
 * BÖLÜM 4 — Refund tutar / kargo düşümü (Faz 3)
 * Pure unit — calculateReturnRefundAmount
 *
 *   npx tsx test/returns/refund-amount.ts
 */
import {
  assert,
  assertEqual,
  section,
  summarize,
} from "./_helpers/assert"
import { calculateReturnRefundAmount } from "../../src/lib/return-refund"

async function main() {
  console.log("\n=== refund-amount ===")

  const orderItems = [
    { id: "li_a", unit_price: 1000, refundable_total_per_unit: 1000 },
    { id: "li_b", unit_price: 500, refundable_total_per_unit: 500 },
    { id: "li_c", unit_price: 259.3, refundable_total_per_unit: 259.3 },
  ]
  const shipping = 149.99

  const reasons = {
    defective: { metadata: { seller_pays_shipping: true } },
    wrong_item: { metadata: { seller_pays_shipping: true } },
    changed_mind: { metadata: { seller_pays_shipping: false } },
    wrong_size_color: { metadata: { seller_pays_shipping: false } },
  }

  // ── 1. Ayıplı → kargo dahil ────────────────────────────────────
  section("1. Ayıplı (seller_pays_shipping true) → kargo dahil")
  const defect = calculateReturnRefundAmount({
    returnStatus: "received",
    returnItems: [
      {
        item_id: "li_a",
        quantity: 1,
        received_quantity: 1,
        reason_id: "defective",
      },
    ],
    orderItems,
    reasonsById: reasons,
    shippingTotal: shipping,
    shippingAlreadyRefunded: false,
  })
  assertEqual("kalem 1000", defect.itemsAmount, 1000)
  assertEqual("kargo 149.99", defect.shippingAmount, 149.99)
  assertEqual("total 1149.99", defect.total, 1149.99)
  assert("shipping_included", defect.shippingIncluded)

  // ── 2. Beğenmedim → kargo hariç ────────────────────────────────
  section("2. Beğenmedim → kargo hariç")
  const mind = calculateReturnRefundAmount({
    returnStatus: "received",
    returnItems: [
      {
        item_id: "li_a",
        quantity: 1,
        received_quantity: 1,
        reason_id: "changed_mind",
      },
    ],
    orderItems,
    reasonsById: reasons,
    shippingTotal: shipping,
    shippingAlreadyRefunded: false,
  })
  assertEqual("kalem 1000", mind.itemsAmount, 1000)
  assertEqual("kargo 0", mind.shippingAmount, 0)
  assertEqual("total 1000", mind.total, 1000)
  assert("shipping_included false", !mind.shippingIncluded)

  // ── 3. Yanlış ürün / hasar → kargo dahil ───────────────────────
  section("3. Yanlış ürün → kargo dahil")
  const wrong = calculateReturnRefundAmount({
    returnStatus: "received",
    returnItems: [
      {
        item_id: "li_b",
        quantity: 1,
        received_quantity: 1,
        reason_id: "wrong_item",
      },
    ],
    orderItems,
    reasonsById: reasons,
    shippingTotal: shipping,
    shippingAlreadyRefunded: false,
  })
  assertEqual("total 649.99", wrong.total, 649.99)
  assert("shipping_included", wrong.shippingIncluded)

  // ── 4. Kısmi + kargo bir kez ───────────────────────────────────
  section("4. Kısmi iade — kargo bir kez")
  const partial = calculateReturnRefundAmount({
    returnStatus: "received",
    returnItems: [
      {
        item_id: "li_a",
        quantity: 1,
        received_quantity: 1,
        reason_id: "defective",
      },
      {
        item_id: "li_c",
        quantity: 1,
        received_quantity: 1,
        reason_id: "defective",
      },
    ],
    orderItems,
    reasonsById: reasons,
    shippingTotal: shipping,
    shippingAlreadyRefunded: false,
  })
  assertEqual("kalemler 1259.3", partial.itemsAmount, 1259.3)
  assertEqual("kargo bir kez 149.99", partial.shippingAmount, 149.99)
  assertEqual("total 1409.29", partial.total, 1409.29)

  const alreadyShipped = calculateReturnRefundAmount({
    returnStatus: "received",
    returnItems: [
      {
        item_id: "li_b",
        quantity: 1,
        received_quantity: 1,
        reason_id: "defective",
      },
    ],
    orderItems,
    reasonsById: reasons,
    shippingTotal: shipping,
    shippingAlreadyRefunded: true,
  })
  assertEqual(
    "önceki iadede kargo alındıysa tekrar eklenmez",
    alreadyShipped.shippingAmount,
    0
  )

  // ── 5. Flag flip changes amount ────────────────────────────────
  section("5. seller_pays_shipping bayrağı tutarı değiştirir")
  assert(
    "defective > changed_mind (aynı kalem)",
    defect.total > mind.total
  )
  assertEqual("fark = kargo", defect.total - mind.total, shipping)

  // ── 6. Zero / no negative ──────────────────────────────────────
  section("6. Sıfır / negatif koruması")
  const zero = calculateReturnRefundAmount({
    returnStatus: "open",
    returnItems: [
      {
        item_id: "li_a",
        quantity: 1,
        received_quantity: 0,
        reason_id: "changed_mind",
      },
    ],
    orderItems,
    reasonsById: reasons,
    shippingTotal: shipping,
    shippingAlreadyRefunded: false,
  })
  assertEqual("henüz received yok → 0", zero.total, 0)
  assert("total negatif değil", zero.total >= 0)

  const code = summarize("refund-amount")
  process.exit(code > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
