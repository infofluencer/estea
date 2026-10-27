/**
 * Reject path smoke: talep aç → reject → refund yok + metadata rejected.
 * Backend ayakta + PAYTR_MOCK + admin şifre gerekir.
 *
 *   PAYTR_MOCK=1 npx medusa exec ./src/scripts/smoke-rma-reject.ts
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStoreReturnRequest } from "../api/store/returns/_create-return"
import { isReturnRejected } from "../lib/return-rejection"
import { processReturnRefund } from "../lib/return-refund"

const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@market.esteacay.com"
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ""
if (!ADMIN_PASSWORD) throw new Error("TEST_ADMIN_PASSWORD env gerekli (sabit yedek şifre kaldırıldı)")
const REASON_MIND = "rr_01M22XV09PVZT2W627JERSC836"

async function adminToken(): Promise<string> {
  const res = await fetch(`${BACKEND}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const json = (await res.json()) as { token?: string }
  if (!json.token) throw new Error(`Admin auth failed: ${JSON.stringify(json)}`)
  return json.token
}

export default async function smokeRmaReject({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Find a requested-capable delivered order with returnable qty (reuse recent paid)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "status",
      "items.id",
      "items.detail.delivered_quantity",
      "items.detail.return_requested_quantity",
      "items.detail.return_received_quantity",
      "items.detail.return_dismissed_quantity",
      "items.detail.fulfilled_quantity",
      "items.detail.shipped_quantity",
    ],
    filters: { is_draft_order: false },
  })

  let orderId = ""
  let email = ""
  let itemId = ""

  for (const o of orders || []) {
    const row = o as {
      id?: string
      email?: string
      status?: string
      items?: {
        id?: string
        detail?: Record<string, unknown>
      }[]
    }
    if (!row.id || row.status === "canceled") continue
    for (const it of row.items || []) {
      if (!it.id || !it.detail) continue
      const d = it.detail
      const delivered = Math.max(
        Number(d.delivered_quantity || 0),
        Number(d.shipped_quantity || 0),
        Number(d.fulfilled_quantity || 0)
      )
      const already =
        Number(d.return_requested_quantity || 0) +
        Number(d.return_received_quantity || 0) +
        Number(d.return_dismissed_quantity || 0)
      if (delivered - already >= 1) {
        orderId = row.id
        email = row.email || "reject-smoke@escay.local"
        itemId = it.id
        break
      }
    }
    if (orderId) break
  }

  if (!orderId) {
    throw new Error(
      "No returnable delivered order found — run smoke-rma-restock-refund first or create a paid delivered order"
    )
  }

  logger.info(`[rma-reject] Using order=${orderId} item=${itemId}`)

  const created = await createStoreReturnRequest(container, {
    order_id: orderId,
    items: [{ id: itemId, quantity: 1 }],
    reason_id: REASON_MIND,
    note: "smoke-reject",
    source: "guest",
  })

  const token = await adminToken()
  const rej = await fetch(`${BACKEND}/admin/returns/${created.id}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Smoke: ürün eksik/hasarlı" }),
  })
  const rejBody = await rej.json()
  if (!rej.ok) {
    throw new Error(`reject failed ${rej.status}: ${JSON.stringify(rejBody)}`)
  }

  const { data: after } = await query.graph({
    entity: "return",
    fields: ["id", "status", "metadata"],
    filters: { id: created.id },
  })
  const ret = after![0] as {
    status?: string
    metadata?: Record<string, unknown>
  }

  if (!isReturnRejected(ret.metadata)) {
    throw new Error("metadata not marked rejected")
  }

  // Critical: processReturnRefund must skip
  const refund = await processReturnRefund(container, {
    return_id: created.id,
    order_id: orderId,
  })
  if (!refund.skipped || refund.meta.status !== "skipped") {
    throw new Error(
      `CRITICAL: refund not skipped after reject: ${JSON.stringify(refund.meta)}`
    )
  }
  if (!String(refund.meta.error || "").toLowerCase().includes("reject")) {
    throw new Error(`unexpected skip reason: ${refund.meta.error}`)
  }

  // Admin refund retry also blocked
  const retry = await fetch(`${BACKEND}/admin/returns/${created.id}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  })
  const retryBody = (await retry.json()) as {
    paytr_refund?: { status?: string; error?: string }
  }
  if (retryBody.paytr_refund?.status === "success") {
    throw new Error("CRITICAL: admin refund retry succeeded on rejected return")
  }

  logger.info(
    `[rma-reject] PASS return=${created.id} status=${ret.status} ` +
      `refund_skipped=true email=${email}`
  )
}
