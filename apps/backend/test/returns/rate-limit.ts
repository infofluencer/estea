/**
 * BÖLÜM 2 — Rate-limit (guest return vs lookup bucket ayrımı)
 *
 * Backend'i test için şu env ile başlatın (kısa pencere):
 *   GUEST_RETURN_RATE_MAX=3
 *   GUEST_RETURN_RATE_WINDOW_MS=5000
 *   ORDER_LOOKUP_RATE_MAX=3
 *   ORDER_LOOKUP_RATE_WINDOW_MS=5000
 *
 *   npx tsx test/returns/rate-limit.ts
 */
import {
  assert,
  assertStatus,
  section,
  summarize,
} from "./_helpers/assert"
import { hasLiveFixture, requireLiveFixture } from "./_helpers/fixture"
import { storeFetch } from "./_helpers/http"

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!hasLiveFixture()) {
    console.error("SKIP: live fixture yok.")
    process.exit(0)
  }

  const fx = requireLiveFixture()
  const returnMax = Number(process.env.GUEST_RETURN_RATE_MAX || 8)
  const lookupMax = Number(process.env.ORDER_LOOKUP_RATE_MAX || 30)
  const returnWindow = Number(process.env.GUEST_RETURN_RATE_WINDOW_MS || 600000)
  const lookupWindow = Number(process.env.ORDER_LOOKUP_RATE_WINDOW_MS || 600000)

  console.log("\n=== rate-limit ===")
  console.log(
    `  config: return ${returnMax}/${returnWindow}ms · lookup ${lookupMax}/${lookupWindow}ms`
  )

  if (returnMax > 10 || returnWindow > 15000) {
    console.log(
      "  NOT: Hızlı test için backend'i GUEST_RETURN_RATE_MAX=3 GUEST_RETURN_RATE_WINDOW_MS=5000 ile başlatın."
    )
  }

  const spoofIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`

  // ── 1. Return bucket 429 ───────────────────────────────────────
  section("1. Guest return limiti → 429")
  let hit429 = false
  for (let i = 0; i < returnMax + 2; i++) {
    const res = await storeFetch("/store/returns/guest", {
      method: "POST",
      headers: { "x-forwarded-for": spoofIp },
      body: JSON.stringify({
        order_id: fx.orderId,
        email: fx.wrongEmail, // 404 ama rate-limit yine sayılır
        items: [{ id: fx.itemId, quantity: 1 }],
        reason_id: fx.reasonId,
      }),
    })
    if (res.status === 429) {
      hit429 = true
      assertStatus(`istek #${i + 1} → 429`, res.status, 429)
      break
    }
  }
  assert("return kovası 429 üretti", hit429)

  // ── 2. Bucket isolation: return full → lookup still works ──────
  section("2. Kova ayrımı (return dolu → lookup çalışır)")
  const lookupAfter = await storeFetch("/store/orders/lookup", {
    method: "POST",
    headers: { "x-forwarded-for": spoofIp },
    body: JSON.stringify({ id: fx.orderId, email: fx.email }),
  })
  assert(
    "lookup hâlâ 2xx/404 (429 değil)",
    lookupAfter.status !== 429,
    `status=${lookupAfter.status}`
  )
  assertStatus("lookup başarılı veya 404", lookupAfter.status, [200, 404])

  // Fill lookup bucket with a different IP so we don't block ourselves forever
  const spoofIp2 = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
  section("2b. Lookup dolu → return ayrı kova")
  let lookup429 = false
  for (let i = 0; i < lookupMax + 2; i++) {
    const res = await storeFetch("/store/orders/lookup", {
      method: "POST",
      headers: { "x-forwarded-for": spoofIp2 },
      body: JSON.stringify({ id: "order_rate_probe", email: "a@b.co" }),
    })
    if (res.status === 429) {
      lookup429 = true
      break
    }
  }
  assert("lookup kovası 429 üretti", lookup429)

  const returnAfterLookup = await storeFetch("/store/returns/guest", {
    method: "POST",
    headers: { "x-forwarded-for": spoofIp2 },
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.wrongEmail,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: fx.reasonId,
    }),
  })
  assert(
    "return lookup 429'undan etkilenmedi",
    returnAfterLookup.status !== 429,
    `status=${returnAfterLookup.status}`
  )

  // ── 3. Window reset (only if short window configured) ──────────
  section("3. Pencere sıfırlama")
  if (returnWindow <= 15000) {
    console.log(`  waiting ${returnWindow + 500}ms…`)
    await sleep(returnWindow + 500)
    const afterWindow = await storeFetch("/store/returns/guest", {
      method: "POST",
      headers: { "x-forwarded-for": spoofIp },
      body: JSON.stringify({
        order_id: fx.orderId,
        email: fx.wrongEmail,
        items: [{ id: fx.itemId, quantity: 1 }],
        reason_id: fx.reasonId,
      }),
    })
    assert(
      "window sonrası return tekrar izinli (≠429)",
      afterWindow.status !== 429,
      `status=${afterWindow.status}`
    )
  } else {
    console.log(
      "  SKIP window reset (GUEST_RETURN_RATE_WINDOW_MS > 15s — kısa window ile tekrarlayın)"
    )
  }

  // ── 4. IP header note ──────────────────────────────────────────
  section("4. IP ayrımı (x-forwarded-for)")
  const ipA = await storeFetch("/store/returns/guest", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({
      order_id: fx.orderId,
      email: fx.wrongEmail,
      items: [{ id: fx.itemId, quantity: 1 }],
      reason_id: fx.reasonId,
    }),
  })
  assert(
    "farklı IP ile istek kabul (spoof mümkün — MANUAL checklist)",
    ipA.status !== 500,
    `status=${ipA.status}`
  )
  console.log(
    "  NOT: Rate-limit x-forwarded-for first hop kullanır; gerçek IP doğrulaması proxy/CDN tarafında olmalı (MANUAL)."
  )

  const code = summarize("rate-limit")
  process.exit(code > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
