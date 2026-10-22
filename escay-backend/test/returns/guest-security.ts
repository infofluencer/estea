/**
 * BÖLÜM 1 — Misafir return güvenliği
 * Requires live backend + fixture env (see README).
 *
 *   npx tsx test/returns/guest-security.ts
 */
import {
  assert,
  assertEqual,
  assertStatus,
  section,
  summarize,
} from "./_helpers/assert"
import { hasLiveFixture, requireLiveFixture } from "./_helpers/fixture"
import {
  bodyMessage,
  responseFingerprint,
  storeFetch,
} from "./_helpers/http"

async function main() {
  if (!hasLiveFixture()) {
    console.error(
      "SKIP: live fixture yok. TEST_ORDER_* + MEDUSA_PUBLISHABLE_KEY ayarla."
    )
    process.exit(0)
  }

  const fx = requireLiveFixture()
  console.log("\n=== guest-security ===")

  // ── 1. Happy path ──────────────────────────────────────────────
  section("1. Happy path")
  const happy = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.email,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: fx.reasonId,
      note: "test-guest-security",
    }),
  })
  assertStatus("guest return 2xx", happy.status, [200, 201])
  const returnId = (happy.body as { return?: { id?: string } })?.return?.id
  assert("Return id döner", Boolean(returnId), bodyMessage(happy.body))

  // ── 2. Enumeration parity ──────────────────────────────────────
  section("2. Enumeration (yanlış email ≡ yok order)")
  const wrongEmail = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.wrongEmail,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: fx.reasonId,
    }),
  })
  const missingOrder = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: "order_does_not_exist_zzz",
      email: fx.email,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: fx.reasonId,
    }),
  })
  assertStatus("yanlış email → 404", wrongEmail.status, 404)
  assertStatus("yok order → 404", missingOrder.status, 404)
  assertEqual(
    "enumeration fingerprint eşit (guest return)",
    responseFingerprint(wrongEmail),
    responseFingerprint(missingOrder)
  )

  const lookupWrong = await storeFetch("/store/orders/lookup", {
    method: "POST",
    body: JSON.stringify({ id: fx.orderId, email: fx.wrongEmail }),
  })
  const lookupMissing = await storeFetch("/store/orders/lookup", {
    method: "POST",
    body: JSON.stringify({
      id: "order_does_not_exist_zzz",
      email: fx.email,
    }),
  })
  assertStatus("lookup yanlış email → 404", lookupWrong.status, 404)
  assertStatus("lookup yok order → 404", lookupMissing.status, 404)
  assertEqual(
    "enumeration fingerprint eşit (lookup)",
    responseFingerprint(lookupWrong),
    responseFingerprint(lookupMissing)
  )

  // ── 3. Generic 404 message ─────────────────────────────────────
  section("3. Generic 404 mesajı")
  const msg = bodyMessage(wrongEmail.body).toLowerCase()
  assert(
    "mesaj email/order ayrımı sızdırmıyor",
    !msg.includes("email") || msg.includes("order not found"),
    msg
  )
  assert(
    "order not found tarzı",
    msg.includes("not found") || msg.includes("bulunamad"),
    msg
  )

  // ── 4. Cross-order email ───────────────────────────────────────
  section("4. Başka order email'i")
  const cross = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.otherOrderEmail,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: fx.reasonId,
    }),
  })
  assertStatus("cross-email red → 404", cross.status, 404)
  assertEqual(
    "cross-email fingerprint = wrong-email",
    responseFingerprint(cross),
    responseFingerprint(wrongEmail)
  )

  // ── 5. Malformed body ──────────────────────────────────────────
  section("5. Malformed body")
  const cases: { label: string; body: unknown }[] = [
    { label: "eksik email", body: { order_id: fx.orderId, items: [{ id: fx.itemId, quantity: 1 }], reason_id: fx.reasonId } },
    { label: "boş items", body: { order_id: fx.orderId, email: fx.email, items: [], reason_id: fx.reasonId } },
    { label: "negatif adet", body: { order_id: fx.orderId, email: fx.email, items: [{ id: fx.itemId, quantity: -1 }], reason_id: fx.reasonId } },
    { label: "items obje", body: { order_id: fx.orderId, email: fx.email, items: { id: fx.itemId }, reason_id: fx.reasonId } },
  ]
  for (const c of cases) {
    const res = await storeFetch("/store/returns/guest", {
      method: "POST",
      body: JSON.stringify(c.body),
    })
    assertStatus(`${c.label} → 4xx`, res.status, [400, 422])
  }

  // ── 6. Invalid item ────────────────────────────────────────────
  section("6. Order'da olmayan kalem")
  const badItem = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.email,
      items: [{ id: "orli_not_in_order_xxx", quantity: 1 }],
      reason_id: fx.reasonId,
    }),
  })
  assert(
    "olmayan kalem reddedilir",
    badItem.status >= 400 && badItem.status < 500,
    `status=${badItem.status} ${bodyMessage(badItem.body)}`
  )

  // ── 7. Qty overflow ────────────────────────────────────────────
  section("7. Adet aşımı")
  const overflow = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.email,
      items: [{ id: fx.itemId, quantity: 999 }],
      reason_id: fx.reasonId,
    }),
  })
  assert(
    "adet aşımı reddedilir",
    overflow.status >= 400 && overflow.status < 500,
    `status=${overflow.status} ${bodyMessage(overflow.body)}`
  )

  // ── 8. Invalid reason ──────────────────────────────────────────
  section("8. Geçersiz reason_id")
  const badReason = await storeFetch("/store/returns/guest", {
    method: "POST",
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.email,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: "rr_does_not_exist_xxx",
    }),
  })
  assert(
    "geçersiz reason reddedilir",
    badReason.status >= 400 && badReason.status < 500,
    `status=${badReason.status} ${bodyMessage(badReason.body)}`
  )

  const code = summarize("guest-security")
  process.exit(code > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
