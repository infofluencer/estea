import { stagingBackendUrl } from "./env"

type AdminFulfillResult =
  | { ok: true; fulfillmentId?: string }
  | { ok: false; reason: string }

/**
 * Staging admin: create a fulfillment so items become returnable.
 * No-op (ok:false) when admin creds are missing — tests should fall back
 * to the "no returnable items" UI assertion.
 */
export async function fulfillOrderViaAdmin(
  orderId: string
): Promise<AdminFulfillResult> {
  const backend = stagingBackendUrl()
  const email =
    process.env.STAGING_ADMIN_EMAIL?.trim() ||
    process.env.TEST_ADMIN_EMAIL?.trim()
  const password =
    process.env.STAGING_ADMIN_PASSWORD?.trim() ||
    process.env.TEST_ADMIN_PASSWORD?.trim()
  if (!backend || !email || !password) {
    return { ok: false, reason: "STAGING_ADMIN_EMAIL/PASSWORD yok" }
  }

  const login = await fetch(`${backend}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const token = ((await login.json()) as { token?: string }).token
  if (!login.ok || !token) {
    return { ok: false, reason: `admin login ${login.status}` }
  }

  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  }

  const orderRes = await fetch(
    `${backend}/admin/orders/${encodeURIComponent(orderId)}?fields=id,*items,*items.detail`,
    { headers }
  )
  if (!orderRes.ok) {
    return { ok: false, reason: `admin order ${orderRes.status}` }
  }
  const orderJson = (await orderRes.json()) as {
    order?: {
      items?: {
        id?: string
        quantity?: number
        detail?: { fulfilled_quantity?: number | string | null }
      }[]
    }
  }
  const items = (orderJson.order?.items || [])
    .filter((i) => i.id)
    .map((i) => ({
      id: i.id as string,
      quantity: Math.max(1, Number(i.quantity) || 1),
    }))
  if (!items.length) {
    return { ok: false, reason: "no order items" }
  }

  const fulfill = await fetch(
    `${backend}/admin/orders/${encodeURIComponent(orderId)}/fulfillments`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ items }),
    }
  )
  if (!fulfill.ok) {
    const body = await fulfill.text().catch(() => "")
    return { ok: false, reason: `fulfill ${fulfill.status} ${body.slice(0, 180)}` }
  }
  const fulJson = (await fulfill.json()) as {
    order?: { fulfillments?: { id?: string }[] }
    fulfillment?: { id?: string }
  }
  const fulfillmentId =
    fulJson.fulfillment?.id || fulJson.order?.fulfillments?.at(-1)?.id

  // Advance to delivered so storefront return UI unlocks (timeline === delivered).
  const statusRes = await fetch(
    `${backend}/admin/orders/${encodeURIComponent(orderId)}/escay-status`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "deliver",
        tracking_number: `E2E-${Date.now().toString().slice(-6)}`,
        tracking_url: "https://example.com/track/e2e",
      }),
    }
  )
  if (!statusRes.ok) {
    // Fallback: fulfill alone may still unlock returnable qty on older deploys.
    const body = await statusRes.text().catch(() => "")
    if (statusRes.status === 404) {
      return { ok: true, fulfillmentId }
    }
    return {
      ok: false,
      reason: `escay-status ${statusRes.status} ${body.slice(0, 160)}`,
    }
  }

  return {
    ok: true,
    fulfillmentId,
  }
}
