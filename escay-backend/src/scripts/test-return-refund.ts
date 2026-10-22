/**
 * Return refund tutar hesabı birim testleri.
 * Çalıştır: npx tsx src/scripts/test-return-refund.ts
 */
import { calculateReturnRefundAmount } from "../lib/return-refund"

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`)
    failed++
  }
}

function assertEqual(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  assert(
    label,
    ok,
    ok ? "" : `got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)}`
  )
}

console.log("\n=== calculateReturnRefundAmount ===")

const orderItems = [
  { id: "li_1", unit_price: 100, refundable_total_per_unit: 100 },
  { id: "li_2", unit_price: 50, refundable_total_per_unit: 50 },
]

const reasons = {
  r_defect: { metadata: { seller_pays_shipping: true } },
  r_mind: { metadata: { seller_pays_shipping: false } },
}

const partialNoShip = calculateReturnRefundAmount({
  returnStatus: "received",
  returnItems: [
    {
      item_id: "li_1",
      quantity: 2,
      received_quantity: 1,
      reason_id: "r_mind",
    },
  ],
  orderItems,
  reasonsById: reasons,
  shippingTotal: 149.99,
  shippingAlreadyRefunded: false,
})

assertEqual("kısmi kalem (1×100)", partialNoShip.itemsAmount, 100)
assertEqual("beğenmedim → kargo yok", partialNoShip.shippingAmount, 0)
assertEqual("total 100", partialNoShip.total, 100)

const defectFull = calculateReturnRefundAmount({
  returnStatus: "received",
  returnItems: [
    {
      item_id: "li_1",
      quantity: 1,
      received_quantity: 1,
      reason_id: "r_defect",
    },
    {
      item_id: "li_2",
      quantity: 1,
      received_quantity: 1,
      reason_id: "r_mind",
    },
  ],
  orderItems,
  reasonsById: reasons,
  shippingTotal: 149.99,
  shippingAlreadyRefunded: false,
})

assertEqual("kalemler 150", defectFull.itemsAmount, 150)
assertEqual("ayıplı → kargo dahil", defectFull.shippingAmount, 149.99)
assertEqual("total 299.99", defectFull.total, 299.99)
assert("shipping_included true", defectFull.shippingIncluded)

const shipAlready = calculateReturnRefundAmount({
  returnStatus: "received",
  returnItems: [
    {
      item_id: "li_1",
      quantity: 1,
      received_quantity: 1,
      reason_id: "r_defect",
    },
  ],
  orderItems,
  reasonsById: reasons,
  shippingTotal: 149.99,
  shippingAlreadyRefunded: true,
})

assertEqual("kargo daha önce iade → 0", shipAlready.shippingAmount, 0)
assertEqual("yalnız kalem", shipAlready.total, 100)

const fallbackQty = calculateReturnRefundAmount({
  returnStatus: "received",
  returnItems: [
    {
      item_id: "li_2",
      quantity: 2,
      received_quantity: 0,
      reason_id: "r_mind",
    },
  ],
  orderItems,
  reasonsById: reasons,
  shippingTotal: 10,
  shippingAlreadyRefunded: false,
})

assertEqual("received_quantity 0 ama status received → quantity", fallbackQty.total, 100)

console.log(`\n${"=".repeat(50)}`)
console.log(`Toplam: ${passed + failed} — ✓ ${passed} / ✗ ${failed}`)
if (failed > 0) process.exit(1)
console.log("Tüm testler geçti!")
