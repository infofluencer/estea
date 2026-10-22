import { assert, assertEqual, assertStatus, section } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import {
  asRecord,
  bodyMessage,
  storeFetch,
} from "../_helpers/http"
import {
  formatOrderNumber,
  type CheckoutContext,
} from "./checkout"

function fingerprint(status: number, body: unknown): string {
  const msg = bodyMessage(body)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  return `${status}|${msg}`
}

export async function runOrderTrackingSuite(
  env: StagingEnv,
  checkout: CheckoutContext
) {
  section("6. Order-tracking (misafir)")

  const happy = await storeFetch(env, `/store/orders/lookup`, {
    method: "POST",
    body: JSON.stringify({
      id: checkout.orderId,
      email: checkout.email,
    }),
  })
  assertStatus("Lookup order_id + email → 200", happy.status, 200)
  const order = asRecord(asRecord(happy.body).order)
  assert(
    "Lookup sipariş id",
    String(order.id) === checkout.orderId,
    String(order.id || bodyMessage(happy.body))
  )

  if (checkout.displayId != null) {
    const six = formatOrderNumber(checkout.displayId)
    const byNumber = await storeFetch(env, `/store/orders/lookup`, {
      method: "POST",
      body: JSON.stringify({ id: six, email: checkout.email }),
    })
    assertStatus("Lookup 6 haneli numara → 200", byNumber.status, 200)
    assert(
      "6 haneli lookup aynı sipariş",
      String(asRecord(asRecord(byNumber.body).order).id) === checkout.orderId,
      six
    )
  }

  const wrongEmail = await storeFetch(env, `/store/orders/lookup`, {
    method: "POST",
    body: JSON.stringify({
      id: checkout.orderId,
      email: "definitely-wrong@example.invalid",
    }),
  })
  const missing = await storeFetch(env, `/store/orders/lookup`, {
    method: "POST",
    body: JSON.stringify({
      id: "order_does_not_exist_staging_smoke",
      email: checkout.email,
    }),
  })

  assertStatus("Yanlış email → 404", wrongEmail.status, 404)
  assertStatus("Yok order → 404", missing.status, 404)
  assertEqual(
    "Enumeration: yanlış email ≡ yok order (generic 404)",
    fingerprint(wrongEmail.status, wrongEmail.body),
    fingerprint(missing.status, missing.body)
  )
}
