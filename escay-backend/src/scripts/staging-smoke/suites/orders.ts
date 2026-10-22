import { assert, assertStatus, section, skip } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import {
  adminFetch,
  asNumber,
  asRecord,
  bodyMessage,
  rawFetch,
} from "../_helpers/http"
import {
  formatOrderNumber,
  type CheckoutContext,
} from "./checkout"

export async function runOrderSuite(
  env: StagingEnv,
  checkout: CheckoutContext
) {
  section("5. Sipariş (admin)")

  if (checkout.displayId != null && checkout.displayId >= 1) {
    const six = formatOrderNumber(checkout.displayId)
    assert(
      "display_id → 6 haneli numara",
      six.length === 6 && Number(six) === 100_000 + checkout.displayId,
      `#${six}`
    )
  } else {
    assert("display_id mevcut", false, `display_id=${checkout.displayId}`)
  }

  if (!env.adminEmail || !env.adminPassword) {
    skip(
      "Admin sipariş okuma",
      "STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD yok"
    )
    return
  }

  const login = await rawFetch(`${env.backendUrl}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: env.adminEmail,
      password: env.adminPassword,
    }),
  })
  assertStatus("Admin login", login.status, 200)
  const token = String(asRecord(login.body).token || "")
  assert("Admin token", Boolean(token), token ? "ok" : bodyMessage(login.body))
  if (!token) return

  const orderRes = await adminFetch(
    env,
    token,
    `/admin/orders/${checkout.orderId}?fields=id,email,display_id,total,metadata,status`
  )
  assertStatus("Admin GET order", orderRes.status, 200)
  const order = asRecord(asRecord(orderRes.body).order)

  assert(
    "Admin order id eşleşiyor",
    String(order.id) === checkout.orderId,
    `admin=${order.id}`
  )
  assert(
    "Admin order email eşleşiyor",
    String(order.email || "").toLowerCase() === checkout.email.toLowerCase(),
    `email=${order.email}`
  )

  const displayId = asNumber(order.display_id)
  assert("Admin display_id ≥ 1", displayId >= 1, `display_id=${displayId}`)
  assert(
    "Admin 6 haneli numara",
    formatOrderNumber(displayId).length === 6,
    `#${formatOrderNumber(displayId)}`
  )
}
