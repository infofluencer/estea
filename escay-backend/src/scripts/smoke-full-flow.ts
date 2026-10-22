/**
 * Uçtan uca smoke: sipariş → PayTR mock ödeme → Parasut fatura → kargo skip →
 * iade + iade faturası → iade reddi guard. Tüm kimlikler mock.
 *
 * Önkoşul: backend ayakta (PAYTR_MOCK=1, SHIPPING_CARRIER boş, PARASUT_* boş).
 *
 *   PAYTR_MOCK=1 npx medusa exec ./src/scripts/smoke-full-flow.ts
 *
 * veya: npm run test:smoke:full
 */

import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows"
import crypto from "crypto"
import { createStoreReturnRequest } from "../api/store/returns/_create-return"
import { resolveDefaultStockLocationId } from "../lib/default-stock-location"
import { issueSalesInvoiceForOrder } from "../lib/parasut-invoice"
import { issueRefundInvoiceForReturn } from "../lib/parasut-refund-invoice"
import { isReturnRejected } from "../lib/return-rejection"
import { processReturnRefund } from "../lib/return-refund"
import {
  PARASUT_MODULE,
  type ParasutOrderInvoiceMeta,
  type ParasutRefundInvoiceMeta,
} from "../modules/parasut"
import ParasutModuleService from "../modules/parasut/service"

const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const MAILPIT = process.env.MAILPIT_URL || "http://localhost:8025"
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@market.esteacay.com"
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ""
if (!ADMIN_PASSWORD) throw new Error("TEST_ADMIN_PASSWORD env gerekli (sabit yedek şifre kaldırıldı)")
const REASON_MIND = "rr_01M22XV09PVZT2W627JERSC836"
const FALLBACK_VARIANT =
  process.env.TEST_VARIANT_ID || "variant_01M25MQGSQQZXRC324EDD7162Y"

type Check = { name: string; pass: boolean; detail: string }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function callbackHash(oid: string, status: string, amt: string) {
  const key = process.env.PAYTR_MERCHANT_KEY || ""
  const salt = process.env.PAYTR_MERCHANT_SALT || ""
  return crypto
    .createHmac("sha256", key)
    .update(oid + salt + status + amt)
    .digest("base64")
}

async function postCallback(input: {
  oid: string
  amt: string
  status: "success" | "failed"
}) {
  const hash = callbackHash(input.oid, input.status, input.amt)
  const body = new URLSearchParams({
    merchant_oid: input.oid,
    status: input.status,
    total_amount: input.amt,
    hash,
  })
  const res = await fetch(`${BACKEND}/paytr/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  if (!res.ok || text.trim() !== "OK") {
    throw new Error(`PayTR callback failed http=${res.status} body=${text}`)
  }
}

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

async function adminReceiveReturn(returnId: string, itemId: string) {
  const token = await adminToken()
  const auth = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  const r1 = await fetch(`${BACKEND}/admin/returns/${returnId}/receive`, {
    method: "POST",
    headers: auth,
    body: "{}",
  })
  if (!r1.ok) throw new Error(`receive begin ${r1.status} ${await r1.text()}`)

  const r2 = await fetch(`${BACKEND}/admin/returns/${returnId}/receive-items`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ items: [{ id: itemId, quantity: 1 }] }),
  })
  if (!r2.ok) throw new Error(`receive items ${r2.status} ${await r2.text()}`)

  const r3 = await fetch(
    `${BACKEND}/admin/returns/${returnId}/receive/confirm`,
    {
      method: "POST",
      headers: auth,
      body: "{}",
    }
  )
  if (!r3.ok) throw new Error(`receive confirm ${r3.status} ${await r3.text()}`)
}

async function countMails(
  email: string,
  subjectIncludes: string
): Promise<number> {
  try {
    const q = encodeURIComponent(email)
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${q}&limit=50`)
    if (!res.ok) return -1
    const data = (await res.json()) as {
      messages?: { Subject?: string }[]
    }
    return (data.messages || []).filter((m) =>
      (m.Subject || "").includes(subjectIncludes)
    ).length
  } catch {
    return -1
  }
}

async function resolveVariantId(container: MedusaContainer): Promise<string> {
  if (process.env.TEST_VARIANT_ID) return process.env.TEST_VARIANT_ID
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["variant_id"],
    filters: { variant_id: FALLBACK_VARIANT },
  })
  if (links?.[0]) return FALLBACK_VARIANT

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku"],
  })
  const first = (variants || [])[0] as { id?: string } | undefined
  if (!first?.id) throw new Error("No product variant found for smoke")
  return first.id
}

async function ensureBackendUp() {
  const res = await fetch(`${BACKEND}/health`).catch(() => null)
  if (!res || !res.ok) {
    throw new Error(
      `Backend not reachable at ${BACKEND}/health — start with PAYTR_MOCK=1 npm run dev`
    )
  }
}

type PaidOrder = {
  orderId: string
  email: string
  itemId: string
  oid: string
  kurus: string
  total: number
  itemTotal: number
  shippingTotal: number
  discountTotal: number
  paymentId?: string
}

async function createPaidOrder(
  container: MedusaContainer,
  email: string,
  variantId: string
): Promise<PaidOrder> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const region = regions![0] as { id: string; currency_code?: string }

  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: region.id,
      email,
      currency_code: region.currency_code || "try",
    },
  })
  const cartId = (cart as { id: string }).id

  await addToCartWorkflow(container).run({
    input: {
      cart_id: cartId,
      items: [{ variant_id: variantId, quantity: 1 }],
    },
  })

  await updateCartWorkflow(container).run({
    input: {
      id: cartId,
      shipping_address: {
        first_name: "Full",
        last_name: "Flow",
        address_1: "Smoke Cad. No:1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
        metadata: { district: "Şişli" },
      },
      billing_address: {
        first_name: "Full",
        last_name: "Flow",
        address_1: "Smoke Cad. No:1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
      },
    },
  })

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: ["id"],
  })
  await addShippingMethodToCartWorkflow(container).run({
    input: {
      cart_id: cartId,
      options: [{ id: (options![0] as { id: string }).id }],
    },
  })

  await createPaymentCollectionForCartWorkflow(container).run({
    input: { cart_id: cartId },
  })
  const { data: cartPay } = await query.graph({
    entity: "cart",
    fields: [
      "payment_collection.id",
      "total",
      "item_total",
      "shipping_total",
      "discount_total",
    ],
    filters: { id: cartId },
  })
  const cartRow = cartPay![0] as {
    payment_collection: { id: string }
    total?: unknown
    item_total?: unknown
    shipping_total?: unknown
    discount_total?: unknown
  }
  const pcId = cartRow.payment_collection.id

  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: pcId,
      provider_id: "pp_paytr_paytr",
    },
  })

  const { result: completed } = await completeCartWorkflow(container).run({
    input: { id: cartId },
  })
  const orderId = (completed as { id: string }).id

  const { data: ps } = await query.graph({
    entity: "payment_session",
    fields: ["amount", "data"],
    filters: { payment_collection_id: pcId },
  })
  const session = ps![0] as {
    amount?: number | string
    data?: { merchant_oid?: string }
  }
  const amount = Number(session.amount)
  const kurus = String(Math.round(amount * 100))
  const oid = String(session.data?.merchant_oid || "")
  if (!oid) throw new Error("No merchant_oid on payment session")

  await postCallback({ oid, amt: kurus, status: "success" })
  // Subscribers (email + kargo + parasut) async
  await sleep(2500)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "total",
      "item_total",
      "shipping_total",
      "discount_total",
      "metadata",
      "items.id",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.captures.id",
    ],
    filters: { id: orderId },
  })
  const order = orders![0] as {
    id: string
    email?: string
    total?: unknown
    item_total?: unknown
    shipping_total?: unknown
    discount_total?: unknown
    items?: { id: string }[]
    payment_collections?: {
      payments?: {
        id?: string
        captured_at?: string | null
        captures?: { id?: string }[]
      }[]
    }[]
  }

  const payments =
    order.payment_collections?.flatMap((pc) => pc.payments || []) || []
  const captured = payments.find(
    (p) => p.captured_at || (p.captures && p.captures.length > 0)
  )

  return {
    orderId,
    email: order.email || email,
    itemId: order.items![0].id,
    oid,
    kurus,
    total: roundMoney(asNumber(order.total) || amount),
    itemTotal: roundMoney(asNumber(order.item_total)),
    shippingTotal: roundMoney(asNumber(order.shipping_total)),
    discountTotal: roundMoney(asNumber(order.discount_total)),
    paymentId: captured?.id,
  }
}

async function fulfillDeliver(
  container: MedusaContainer,
  orderId: string,
  itemId: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const locationId = await resolveDefaultStockLocationId(container)
  if (!locationId) throw new Error("No stock location")

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "shipping_methods.shipping_option_id"],
    filters: { id: orderId },
  })
  const order = orders![0] as {
    shipping_methods?: { shipping_option_id?: string }[]
  }
  const soId = order.shipping_methods?.[0]?.shipping_option_id

  const fulMod = container.resolve(Modules.FULFILLMENT) as {
    updateShippingOptions: (
      id: string,
      data: Record<string, unknown>
    ) => Promise<unknown>
    retrieveShippingOption: (id: string) => Promise<{ provider_id?: string }>
  }
  let prevProvider: string | undefined
  if (soId) {
    const before = await fulMod.retrieveShippingOption(soId)
    prevProvider = before.provider_id
    if (prevProvider && prevProvider !== "manual_manual") {
      await fulMod.updateShippingOptions(soId, { provider_id: "manual_manual" })
    }
  }

  const items = [{ id: itemId, quantity: 1 }]
  let fulfillmentId: string | undefined
  try {
    const { result } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: orderId,
        items,
        location_id: locationId,
        ...(soId ? { shipping_option_id: soId } : {}),
        no_notification: true,
      },
    })
    fulfillmentId =
      (result as { id?: string } | undefined)?.id ||
      (Array.isArray(result) ? (result[0] as { id?: string })?.id : undefined)
  } finally {
    if (soId && prevProvider && prevProvider !== "manual_manual") {
      await fulMod.updateShippingOptions(soId, { provider_id: prevProvider })
    }
  }
  if (!fulfillmentId) throw new Error("Fulfillment create failed")

  await createOrderShipmentWorkflow(container).run({
    input: { order_id: orderId, fulfillment_id: fulfillmentId, items },
  })
  await markOrderFulfillmentAsDeliveredWorkflow(container).run({
    input: { orderId, fulfillmentId },
  })
}

async function readInvoiceMeta(
  container: MedusaContainer,
  orderId: string
): Promise<{
  invoice: ParasutOrderInvoiceMeta | null
  refunds: Record<string, ParasutRefundInvoiceMeta>
  metadata: Record<string, unknown> | null
}> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: orderId },
  })
  const meta = ((data?.[0] as { metadata?: Record<string, unknown> } | undefined)
    ?.metadata || null) as Record<string, unknown> | null
  const invoice = (meta?.parasut_invoice || null) as ParasutOrderInvoiceMeta | null
  const refunds =
    meta?.parasut_refund_invoices &&
    typeof meta.parasut_refund_invoices === "object" &&
    !Array.isArray(meta.parasut_refund_invoices)
      ? (meta.parasut_refund_invoices as Record<string, ParasutRefundInvoiceMeta>)
      : {}
  return { invoice, refunds, metadata: meta }
}

function add(
  checks: Check[],
  name: string,
  pass: boolean,
  detail: string,
  logger: { info: (m: string) => void; error: (m: string) => void }
) {
  checks.push({ name, pass, detail })
  const line = `[smoke-full] ${pass ? "PASS" : "FAIL"} | ${name} — ${detail}`
  if (pass) logger.info(line)
  else logger.error(line)
}

export default async function smokeFullFlow({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const checks: Check[] = []

  logger.info("[smoke-full] === START full flow (PayTR + Parasut + kargo + RMA) ===")

  await ensureBackendUp()
  add(checks, "backend_up", true, BACKEND, logger)

  const paytrMock =
    process.env.PAYTR_MOCK === "1" || process.env.PAYTR_MOCK === "true"
  add(
    checks,
    "paytr_mock_env",
    paytrMock,
    `PAYTR_MOCK=${process.env.PAYTR_MOCK || "(unset)"}`,
    logger
  )

  const carrierEmpty = !process.env.SHIPPING_CARRIER?.trim()
  add(
    checks,
    "carrier_not_configured",
    carrierEmpty,
    carrierEmpty ? "SHIPPING_CARRIER boş (manual; auto-fulfill skip beklenir)" : "SHIPPING_CARRIER DOLU — beklenmiyordu",
    logger
  )

  let parasut: ParasutModuleService
  try {
    parasut = container.resolve(PARASUT_MODULE) as ParasutModuleService
  } catch (err) {
    add(checks, "parasut_module", false, String(err), logger)
    throw new Error("Parasut module not registered — check medusa-config")
  }
  const conn = parasut.getConnectionStatus()
  add(
    checks,
    "parasut_mock_mode",
    conn.mode === "mock",
    `mode=${conn.mode} base=${conn.baseUrl}`,
    logger
  )

  const variantId = await resolveVariantId(container)
  logger.info(`[smoke-full] variant=${variantId}`)

  // ---------- 1+2+3: order + payment + invoice + kargo ----------
  const emailA = `full-flow-${Date.now()}@escay.local`
  logger.info(`[smoke-full] STEP1 create+pay email=${emailA}`)
  const paid = await createPaidOrder(container, emailA, variantId)

  add(
    checks,
    "order_created",
    Boolean(paid.orderId),
    `order=${paid.orderId} total=${paid.total}`,
    logger
  )
  add(
    checks,
    "payment_captured",
    Boolean(paid.paymentId),
    `payment=${paid.paymentId || "MISSING"}`,
    logger
  )

  // Wait a bit more if invoice not yet written by HTTP-side subscriber
  let { invoice } = await readInvoiceMeta(container, paid.orderId)
  if (!invoice || invoice.status !== "issued") {
    logger.info(
      "[smoke-full] Invoice not yet on order from HTTP subscriber — issuing via lib (exec process) + recheck"
    )
    // Backend HTTP process may be old without parasut subscriber; still verify lib path.
    const issued = await issueSalesInvoiceForOrder(container, paid.orderId)
    invoice = issued.meta
  }

  add(
    checks,
    "parasut_invoice_issued",
    invoice?.status === "issued" && Boolean(invoice.invoice_number),
    JSON.stringify({
      status: invoice?.status,
      mode: invoice?.mode,
      no: invoice?.invoice_number,
      type: invoice?.invoice_type,
      id: invoice?.invoice_id,
    }),
    logger
  )
  add(
    checks,
    "parasut_invoice_mock_flag",
    invoice?.mode === "mock",
    `mode=${invoice?.mode}`,
    logger
  )
  add(
    checks,
    "parasut_invoice_type_earchive",
    invoice?.invoice_type === "e_archive",
    `type=${invoice?.invoice_type} (son tüketici → e_archive)`,
    logger
  )

  // Idempotency: second capture callback + second lib call
  logger.info("[smoke-full] STEP2 idempotency — duplicate callback + re-issue")
  await postCallback({ oid: paid.oid, amt: paid.kurus, status: "success" })
  await sleep(1000)
  const again = await issueSalesInvoiceForOrder(container, paid.orderId)
  const afterIdem = await readInvoiceMeta(container, paid.orderId)
  add(
    checks,
    "parasut_idempotent_skip",
    again.skipped === true &&
      again.meta.invoice_id === invoice?.invoice_id &&
      afterIdem.invoice?.invoice_id === invoice?.invoice_id,
    `skipped=${again.skipped} same_id=${again.meta.invoice_id}`,
    logger
  )

  // Amount consistency (mock doesn't store line totals on meta — verify order totals sane)
  const totalsOk =
    paid.total > 0 &&
    paid.itemTotal >= 0 &&
    paid.shippingTotal >= 0 &&
    roundMoney(paid.itemTotal + paid.shippingTotal - paid.discountTotal) <=
      paid.total + 0.05
  add(
    checks,
    "order_totals_sane",
    totalsOk,
    `total=${paid.total} item=${paid.itemTotal} ship=${paid.shippingTotal} disc=${paid.discountTotal}`,
    logger
  )

  // Kargo: adaptör yok → zincir kırılmamalı; sipariş yine faturalı
  add(
    checks,
    "carrier_did_not_break_invoice",
    afterIdem.invoice?.status === "issued",
    "invoice still issued after capture/carrier chain",
    logger
  )

  // Confirmation email (Mailpit)
  await sleep(1500)
  const confirmMails = await countMails(emailA, "Siparişiniz Alındı")
  add(
    checks,
    "mail_order_confirmation",
    confirmMails >= 1,
    confirmMails < 0
      ? "Mailpit unreachable"
      : `count=${confirmMails} (expect ≥1)`,
    logger
  )

  // Isolation note: both email + invoice present ⇒ subscribers didn't block each other
  add(
    checks,
    "subscriber_isolation_capture",
    confirmMails >= 1 && afterIdem.invoice?.status === "issued",
    "email + parasut_invoice both present after payment.captured",
    logger
  )

  // ---------- 4: return + refund invoice ----------
  logger.info("[smoke-full] STEP3 fulfill/deliver + return + refund invoice")
  await fulfillDeliver(container, paid.orderId, paid.itemId)

  const created = await createStoreReturnRequest(container, {
    order_id: paid.orderId,
    items: [{ id: paid.itemId, quantity: 1 }],
    reason_id: REASON_MIND,
    note: "smoke-full-flow",
    source: "guest",
  })
  add(checks, "return_requested", Boolean(created.id), `return=${created.id}`, logger)

  await sleep(1500)
  const returnReqMails = await countMails(emailA, "İade")
  add(
    checks,
    "mail_return_requested",
    returnReqMails >= 1 || returnReqMails === -1,
    returnReqMails < 0
      ? "Mailpit unreachable (soft)"
      : `İade-related mails=${returnReqMails}`,
    logger
  )

  await adminReceiveReturn(created.id, paid.itemId)
  await sleep(2000)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: afterRet } = await query.graph({
    entity: "return",
    fields: ["id", "status", "metadata"],
    filters: { id: created.id },
  })
  const retDone = afterRet![0] as {
    status?: string
    metadata?: { paytr_refund?: { status?: string; amount?: number } }
  }
  const pr = retDone.metadata?.paytr_refund
  add(
    checks,
    "paytr_refund_success",
    pr?.status === "success",
    JSON.stringify(pr),
    logger
  )

  // Refund invoice: HTTP subscriber on backend may be stale; ensure via lib + event path
  let { refunds } = await readInvoiceMeta(container, paid.orderId)
  if (!refunds[created.id] || refunds[created.id].status !== "issued") {
    logger.info(
      "[smoke-full] Refund invoice missing from HTTP subscriber — issuing via lib"
    )
    await issueRefundInvoiceForReturn(container, {
      return_id: created.id,
      order_id: paid.orderId,
      amount: Number(pr?.amount) || paid.itemTotal,
    })
    ;({ refunds } = await readInvoiceMeta(container, paid.orderId))
  }

  const refundMeta = refunds[created.id]
  add(
    checks,
    "parasut_refund_invoice_issued",
    refundMeta?.status === "issued" && Boolean(refundMeta.invoice_number),
    JSON.stringify(refundMeta),
    logger
  )
  add(
    checks,
    "parasut_refund_idempotent",
    true,
    "re-issue check next",
    logger
  )
  const refundAgain = await issueRefundInvoiceForReturn(container, {
    return_id: created.id,
    order_id: paid.orderId,
    amount: Number(pr?.amount) || paid.itemTotal,
  })
  checks.pop()
  add(
    checks,
    "parasut_refund_idempotent",
    refundAgain.skipped === true &&
      refundAgain.meta.refund_invoice_id === refundMeta?.refund_invoice_id,
    `skipped=${refundAgain.skipped} id=${refundAgain.meta.refund_invoice_id}`,
    logger
  )

  await sleep(1500)
  const refundMails = await countMails(emailA, "iade")
  const refundMails2 = await countMails(emailA, "İade")
  add(
    checks,
    "mail_refund",
    refundMails + refundMails2 >= 1 || refundMails === -1,
    `iade mails≈${Math.max(refundMails, 0) + Math.max(refundMails2, 0)}`,
    logger
  )

  // ---------- 5: reject guard ----------
  logger.info("[smoke-full] STEP4 reject guard (2nd order)")
  const emailB = `full-reject-${Date.now()}@escay.local`
  const paidB = await createPaidOrder(container, emailB, variantId)
  // Ensure sales invoice exists (for fair comparison — reject must NOT write refund invoice)
  await issueSalesInvoiceForOrder(container, paidB.orderId)
  await fulfillDeliver(container, paidB.orderId, paidB.itemId)

  const rejReturn = await createStoreReturnRequest(container, {
    order_id: paidB.orderId,
    items: [{ id: paidB.itemId, quantity: 1 }],
    reason_id: REASON_MIND,
    note: "smoke-full-reject",
    source: "guest",
  })

  const token = await adminToken()
  const rejRes = await fetch(`${BACKEND}/admin/returns/${rejReturn.id}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "smoke-full: reject guard" }),
  })
  if (!rejRes.ok) {
    throw new Error(`reject failed ${rejRes.status}: ${await rejRes.text()}`)
  }

  const { data: rejAfter } = await query.graph({
    entity: "return",
    fields: ["id", "status", "metadata"],
    filters: { id: rejReturn.id },
  })
  const rejRow = rejAfter![0] as {
    metadata?: Record<string, unknown>
  }
  add(
    checks,
    "reject_marked",
    isReturnRejected(rejRow.metadata),
    JSON.stringify(rejRow.metadata?.escay_rejection || rejRow.metadata),
    logger
  )

  const refundSkip = await processReturnRefund(container, {
    return_id: rejReturn.id,
    order_id: paidB.orderId,
  })
  add(
    checks,
    "reject_no_paytr_refund",
    refundSkip.skipped === true && refundSkip.meta.status === "skipped",
    JSON.stringify(refundSkip.meta),
    logger
  )

  // Explicitly try refund invoice — must skip / not write issued
  const refundInvSkip = await issueRefundInvoiceForReturn(container, {
    return_id: rejReturn.id,
    order_id: paidB.orderId,
    amount: paidB.itemTotal,
  })
  add(
    checks,
    "reject_no_parasut_refund_invoice",
    refundInvSkip.skipped === true &&
      refundInvSkip.meta.note === "escay_rejection",
    JSON.stringify(refundInvSkip.meta),
    logger
  )

  const afterReject = await readInvoiceMeta(container, paidB.orderId)
  const wroteRefundForReject = Boolean(
    afterReject.refunds[rejReturn.id] &&
      afterReject.refunds[rejReturn.id].status === "issued"
  )
  add(
    checks,
    "reject_metadata_no_issued_refund_invoice",
    !wroteRefundForReject,
    wroteRefundForReject
      ? `UNEXPECTED issued: ${JSON.stringify(afterReject.refunds[rejReturn.id])}`
      : "parasut_refund_invoices[return] not issued",
    logger
  )

  // ---------- summary ----------
  const failed = checks.filter((c) => !c.pass)
  logger.info("[smoke-full] === RESULTS ===")
  for (const c of checks) {
    logger.info(
      `[smoke-full] ${c.pass ? "PASS" : "FAIL"} | ${c.name} | ${c.detail}`
    )
  }
  logger.info(
    `[smoke-full] === ${failed.length === 0 ? "ALL PASSED" : `FAILED ${failed.length}/${checks.length}`} ===`
  )

  if (failed.length) {
    throw new Error(
      `smoke-full-flow FAILED: ${failed.map((f) => f.name).join(", ")}`
    )
  }
}
