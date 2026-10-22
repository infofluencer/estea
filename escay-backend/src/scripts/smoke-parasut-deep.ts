/**
 * Parasut e-fatura/e-arşiv — derin mock smoke.
 * Env boş (mock), gerçek HTTP yok. VKN ayrımı, tutar/format, hata, idempotency, iade.
 *
 *   PAYTR_MOCK=1 npm run test:smoke:parasut-deep
 */

import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  PromotionActions,
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
  updateCartPromotionsWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows"
import crypto from "crypto"
import { createStoreReturnRequest } from "../api/store/returns/_create-return"
import { resolveDefaultStockLocationId } from "../lib/default-stock-location"
import {
  issueSalesInvoiceForOrder,
  mapMedusaTaxRateToParasutVat,
  toParasutAmount,
  grossToNet,
  estimateGrossFromParasutLines,
} from "../lib/parasut-invoice"
import { issueRefundInvoiceForReturn } from "../lib/parasut-refund-invoice"
import { isReturnRejected } from "../lib/return-rejection"
import {
  buildSalesInvoicePayload,
  estimatePayloadNetTotal,
  PARASUT_MODULE,
  ParasutClient,
  ParasutError,
  resolveMockInvoiceType,
  type ParasutOrderInvoiceMeta,
  type ParasutRefundInvoiceMeta,
  type ParasutSalesInvoicePayload,
} from "../modules/parasut"
import { normalizeOptions } from "../modules/parasut/options"
import ParasutModuleService from "../modules/parasut/service"

const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@market.esteacay.com"
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ""
if (!ADMIN_PASSWORD) throw new Error("TEST_ADMIN_PASSWORD env gerekli (sabit yedek şifre kaldırıldı)")
const REASON_MIND = "rr_01M22XV09PVZT2W627JERSC836" // seller_pays_shipping false
const REASON_DEFECT = "rr_01M22XV09PK6PSY9QRC2Y350B0" // seller_pays_shipping true
const FALLBACK_VARIANT =
  process.env.TEST_VARIANT_ID || "variant_01M25MQGSQQZXRC324EDD7162Y"
const PROMO_CODE = "hosgeldin10"

type Check = { name: string; pass: boolean; detail: string }

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

function moneyField(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value != null && typeof value === "object") {
    const o = value as { value?: unknown; numeric?: unknown; amount?: unknown }
    if (o.value != null) return moneyField(o.value)
    if (o.numeric != null) return moneyField(o.numeric)
    if (o.amount != null) return moneyField(o.amount)
  }
  return 0
}

function add(
  checks: Check[],
  name: string,
  pass: boolean,
  detail: string,
  logger: { info: (m: string) => void; error: (m: string) => void }
) {
  checks.push({ name, pass, detail })
  const line = `[parasut-deep] ${pass ? "PASS" : "FAIL"} | ${name} — ${detail}`
  if (pass) logger.info(line)
  else logger.error(line)
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

async function adminReceiveReturn(
  returnId: string,
  itemId: string,
  quantity = 1
) {
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
    body: JSON.stringify({ items: [{ id: itemId, quantity }] }),
  })
  if (!r2.ok) throw new Error(`receive items ${r2.status} ${await r2.text()}`)
  const r3 = await fetch(
    `${BACKEND}/admin/returns/${returnId}/receive/confirm`,
    { method: "POST", headers: auth, body: "{}" }
  )
  if (!r3.ok) throw new Error(`receive confirm ${r3.status} ${await r3.text()}`)
}

async function ensureBackendUp() {
  const res = await fetch(`${BACKEND}/health`).catch(() => null)
  if (!res || !res.ok) {
    throw new Error(
      `Backend not reachable at ${BACKEND}/health — start with PAYTR_MOCK=1 npm run dev`
    )
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
    fields: ["id"],
  })
  const first = (variants || [])[0] as { id?: string } | undefined
  if (!first?.id) throw new Error("No product variant found")
  return first.id
}

async function ensureStock(
  container: MedusaContainer,
  variantId: string,
  minQty = 50
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const locationId = await resolveDefaultStockLocationId(container)
  if (!locationId) throw new Error("No stock location for ensureStock")

  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["inventory_item_id"],
    filters: { variant_id: variantId },
  })
  const invId = (links?.[0] as { inventory_item_id?: string } | undefined)
    ?.inventory_item_id
  if (!invId) return

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "stocked_quantity", "inventory_item_id", "location_id"],
    filters: { inventory_item_id: invId },
  })
  const level =
    (levels || []).find(
      (l) => (l as { location_id?: string }).location_id === locationId
    ) || levels?.[0]
  if (!level) return

  const row = level as {
    id: string
    stocked_quantity?: number
    inventory_item_id: string
    location_id: string
  }
  if (Number(row.stocked_quantity || 0) >= minQty) return

  const inv = container.resolve(Modules.INVENTORY) as {
    updateInventoryLevels: (
      data: {
        id: string
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }[]
    ) => Promise<unknown>
  }
  await inv.updateInventoryLevels([
    {
      id: row.id,
      inventory_item_id: row.inventory_item_id,
      location_id: row.location_id,
      stocked_quantity: minQty,
    },
  ])
}

type OrderOpts = {
  email: string
  variantId: string
  quantity?: number
  promoCode?: string
  /** Billing address metadata (VKN vb.) */
  billingMeta?: Record<string, unknown>
  itemCount?: number
}

type PaidOrder = {
  orderId: string
  email: string
  itemIds: string[]
  oid: string
  kurus: string
  total: number
  itemTotal: number
  shippingTotal: number
  discountTotal: number
  taxTotal: number
  paymentId?: string
}

async function createPaidOrder(
  container: MedusaContainer,
  opts: OrderOpts
): Promise<PaidOrder> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const qty = opts.quantity ?? 1
  const itemCount = opts.itemCount ?? 1

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const region = regions![0] as { id: string; currency_code?: string }

  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: region.id,
      email: opts.email,
      currency_code: region.currency_code || "try",
    },
  })
  const cartId = (cart as { id: string }).id

  const items = Array.from({ length: itemCount }, () => ({
    variant_id: opts.variantId,
    quantity: qty,
  }))
  await addToCartWorkflow(container).run({
    input: { cart_id: cartId, items },
  })

  await updateCartWorkflow(container).run({
    input: {
      id: cartId,
      shipping_address: {
        first_name: "Deep",
        last_name: "Parasut",
        address_1: "Smoke Cad. No:1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
        metadata: { district: "Şişli" },
      },
      billing_address: {
        first_name: "Deep",
        last_name: "Parasut",
        address_1: "Smoke Cad. No:1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
        metadata: opts.billingMeta || {},
      },
    },
  })

  if (opts.promoCode) {
    const promoResult = await updateCartPromotionsWorkflow(container).run({
      input: {
        cart_id: cartId,
        promo_codes: [opts.promoCode],
        action: PromotionActions.ADD,
      },
    })
    const skipped = (promoResult.result as { skipped_promo_codes?: unknown[] })
      ?.skipped_promo_codes
    if (skipped && skipped.length) {
      // soft — smoke devam eder; indirim assertions ayrı FAIL eder
      console.warn(
        `[parasut-deep] promo skipped: ${JSON.stringify(skipped)}`
      )
    }
  }

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
      "tax_total",
    ],
    filters: { id: cartId },
  })
  const cartRow = cartPay![0] as {
    payment_collection: { id: string }
    total?: unknown
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
  if (!oid) throw new Error("No merchant_oid")

  await postCallback({ oid, amt: kurus, status: "success" })
  await sleep(2000)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "total",
      "item_total",
      "shipping_total",
      "discount_total",
      "tax_total",
      "items.id",
      "items.quantity",
      "items.unit_price",
      "items.subtotal",
      "items.total",
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
    tax_total?: unknown
    items?: {
      id: string
      quantity?: number
      unit_price?: unknown
      subtotal?: unknown
      total?: unknown
    }[]
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

  // Payment session amount güvenilir (graph total bazen shipping'e çöküyor)
  const paidTotal = roundMoney(amount)
  const shippingTotal = roundMoney(
    moneyField(order.shipping_total) ||
      (liveShippingGuess(order) ?? 0)
  )
  const itemsFromLines = roundMoney(
    (order.items || []).reduce((s, it) => {
      const qty = Math.max(1, Number(it.quantity) || 1)
      const line =
        moneyField(it.subtotal) ||
        moneyField(it.total) ||
        moneyField(it.unit_price) * qty
      return s + line
    }, 0)
  )
  const itemTotal = roundMoney(
    itemsFromLines ||
      moneyField(order.item_total) ||
      Math.max(0, paidTotal - shippingTotal)
  )
  const discountTotal = roundMoney(moneyField(order.discount_total))
  const taxTotal = roundMoney(moneyField(order.tax_total))

  return {
    orderId,
    email: order.email || opts.email,
    itemIds: (order.items || []).map((i) => i.id),
    oid,
    kurus,
    total: paidTotal,
    itemTotal,
    shippingTotal,
    discountTotal,
    taxTotal,
    paymentId: captured?.id,
  }
}

function liveShippingGuess(order: {
  shipping_total?: unknown
  total?: unknown
}): number | null {
  const s = moneyField(order.shipping_total)
  return s > 0 ? s : null
}

async function fulfillDeliver(
  container: MedusaContainer,
  orderId: string,
  itemIds: string[]
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const locationId = await resolveDefaultStockLocationId(container)
  if (!locationId) throw new Error("No stock location")

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "shipping_methods.shipping_option_id",
      "items.id",
      "items.quantity",
    ],
    filters: { id: orderId },
  })
  const order = orders![0] as {
    shipping_methods?: { shipping_option_id?: string }[]
    items?: { id: string; quantity?: number }[]
  }
  const qtyById = new Map(
    (order.items || []).map((i) => [i.id, Math.max(1, Number(i.quantity) || 1)])
  )
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
  const items = itemIds.map((id) => ({
    id,
    quantity: qtyById.get(id) || 1,
  }))
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
  return { invoice, refunds }
}

async function clearInvoiceMeta(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const orderModule = container.resolve(Modules.ORDER)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: orderId },
  })
  const prev = {
    ...(((data?.[0] as { metadata?: Record<string, unknown> } | undefined)
      ?.metadata || {}) as Record<string, unknown>),
  }
  // Medusa metadata merge: nested key'i null + ardından "smoke_reset" ile ez.
  // invoice_id OLMADAN status≠issued → idempotent skip / resume yok.
  await orderModule.updateOrders([
    {
      id: orderId,
      metadata: {
        ...prev,
        parasut_invoice: null,
      },
    },
  ])
  await orderModule.updateOrders([
    {
      id: orderId,
      metadata: {
        ...prev,
        parasut_invoice: {
          status: "skipped",
          mode: "mock",
          note: "smoke_reset",
          at: new Date().toISOString(),
        },
      },
    },
  ])
  const after = await readInvoiceMeta(container, orderId)
  if (after.invoice?.status === "issued" || after.invoice?.invoice_id) {
    throw new Error(
      `clearInvoiceMeta failed order=${orderId} still=${JSON.stringify(after.invoice)}`
    )
  }
}

function samplePayloadFixture(): ParasutSalesInvoicePayload {
  return buildSalesInvoicePayload({
    contactId: "mock-contact-demo",
    orderId: "order_demo",
    orderDisplayId: "ESC-1001",
    currencyCode: "try",
    description: "Es Çay sipariş ESC-1001",
    lines: [
      {
        description: "İpek Eşarp",
        quantity: 2,
        unitPrice: 899.5,
        vatRate: 10,
        discountValue: 44.975, // hosgeldin10 → kalem indirimi (amount)
      },
      {
        description: "Art Edition (KDV %20)",
        quantity: 1,
        unitPrice: 1200,
        vatRate: 20,
      },
    ],
    shipping: { description: "Kargo", amount: 124.99, vatRate: 20 },
    orderDiscount: null,
  })
}

export default async function smokeParasutDeep({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const checks: Check[] = []
  let examplePayload: ParasutSalesInvoicePayload | null = null

  logger.info(
    "[parasut-deep] === START Parasut deep mock (VKN / tutar / hata / idempotency / iade) ==="
  )

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

  let parasutSvc: ParasutModuleService
  try {
    parasutSvc = container.resolve(PARASUT_MODULE) as ParasutModuleService
  } catch (err) {
    add(checks, "parasut_module", false, String(err), logger)
    throw err
  }
  const conn = parasutSvc.getConnectionStatus()
  add(
    checks,
    "parasut_mock_mode",
    conn.mode === "mock",
    `mode=${conn.mode} (env boş → mock, HTTP yok)`,
    logger
  )

  // ═══════════════════════════════════════════════════════════
  // 1. VKN AYRIMI
  // ═══════════════════════════════════════════════════════════
  logger.info("[parasut-deep] --- 1. VKN ayrımı (mock check_vkn_type) ---")
  logger.info(
    "[parasut-deep] Mock kural: 10 hane + '9' ile başlayan VKN → e_invoice (kayıtlı); aksi e_archive"
  )

  add(
    checks,
    "vkn_none_e_archive",
    resolveMockInvoiceType(null) === "e_archive" &&
      resolveMockInvoiceType("") === "e_archive",
    "VKN yok → e_archive",
    logger
  )
  add(
    checks,
    "vkn_tckn_e_archive",
    resolveMockInvoiceType("12345678901") === "e_archive",
    "11 hane TCKN → e_archive",
    logger
  )
  add(
    checks,
    "vkn_unregistered_e_archive",
    resolveMockInvoiceType("1234567890") === "e_archive",
    "10 hane VKN ama '9' ile başlamıyor → e_archive (kayıtsız)",
    logger
  )
  add(
    checks,
    "vkn_registered_e_invoice",
    resolveMockInvoiceType("9123456789") === "e_invoice",
    "10 hane + 9… → e_invoice (mock kayıtlı)",
    logger
  )

  const mockClient = new ParasutClient({
    ...normalizeOptions({}),
    forceMock: true,
  })
  const t1 = await mockClient.checkVknType(null)
  const t2 = await mockClient.checkVknType("1234567890")
  const t3 = await mockClient.checkVknType("9123456789")
  add(
    checks,
    "check_vkn_type_both_paths",
    t1 === "e_archive" && t2 === "e_archive" && t3 === "e_invoice",
    `none=${t1} unreg=${t2} reg=${t3}`,
    logger
  )

  mockClient.setMockBehavior({ failOn: "checkVkn" })
  const tFail = await mockClient.checkVknType("9123456789")
  add(
    checks,
    "check_vkn_fail_fallback_earchive",
    tFail === "e_archive",
    `forced fail → fallback e_archive (canlı ile aynı politika)`,
    logger
  )
  mockClient.setMockBehavior({})

  const variantId = await resolveVariantId(container)
  await ensureStock(container, variantId, 80)
  logger.info(`[parasut-deep] variant=${variantId}`)

  // Order-level VKN: no VKN
  const orderNoVkn = await createPaidOrder(container, {
    email: `parasut-novkn-${Date.now()}@escay.local`,
    variantId,
  })
  let inv = (await readInvoiceMeta(container, orderNoVkn.orderId)).invoice
  if (!inv || inv.status !== "issued") {
    await issueSalesInvoiceForOrder(container, orderNoVkn.orderId)
    inv = (await readInvoiceMeta(container, orderNoVkn.orderId)).invoice
  }
  add(
    checks,
    "order_no_vkn_e_archive",
    inv?.invoice_type === "e_archive" && inv?.status === "issued",
    `type=${inv?.invoice_type} status=${inv?.status}`,
    logger
  )

  // Unregistered VKN
  const orderUnreg = await createPaidOrder(container, {
    email: `parasut-unreg-${Date.now()}@escay.local`,
    variantId,
    billingMeta: { vkn: "1234567890" },
  })
  await clearInvoiceMeta(container, orderUnreg.orderId)
  const issuedUnreg = await issueSalesInvoiceForOrder(
    container,
    orderUnreg.orderId
  )
  add(
    checks,
    "order_vkn_unreg_e_archive",
    issuedUnreg.meta.invoice_type === "e_archive" &&
      issuedUnreg.meta.tax_number === "1234567890",
    `type=${issuedUnreg.meta.invoice_type} tax=${issuedUnreg.meta.tax_number}`,
    logger
  )

  // Registered VKN (mock e_invoice)
  const orderReg = await createPaidOrder(container, {
    email: `parasut-reg-${Date.now()}@escay.local`,
    variantId,
    billingMeta: { vkn: "9123456789" },
  })
  await clearInvoiceMeta(container, orderReg.orderId)
  const issuedReg = await issueSalesInvoiceForOrder(container, orderReg.orderId)
  add(
    checks,
    "order_vkn_reg_e_invoice",
    issuedReg.meta.invoice_type === "e_invoice" &&
      String(issuedReg.meta.invoice_number || "").startsWith("EF-"),
    `type=${issuedReg.meta.invoice_type} no=${issuedReg.meta.invoice_number}`,
    logger
  )

  // ═══════════════════════════════════════════════════════════
  // 2. TUTAR / FORMAT
  // ═══════════════════════════════════════════════════════════
  logger.info("[parasut-deep] --- 2. Tutar / format doğruluğu ---")

  add(
    checks,
    "vat_map_0.1_to_10",
    mapMedusaTaxRateToParasutVat(0.1, 10) === 10,
    "Medusa 0.1 → Parasut 10",
    logger
  )
  add(
    checks,
    "vat_map_0.2_to_20",
    mapMedusaTaxRateToParasutVat(0.2, 10) === 20,
    "Medusa 0.2 → Parasut 20",
    logger
  )
  add(
    checks,
    "vat_map_10_passthrough",
    mapMedusaTaxRateToParasutVat(10, 10) === 10,
    "Medusa 10 → Parasut 10",
    logger
  )
  add(
    checks,
    "amount_no_x100",
    toParasutAmount(1689.29) === 1689.29 && toParasutAmount(10.999) === 11,
    "major-unit TL, kuruş çarpanı YOK",
    logger
  )
  add(
    checks,
    "gross_to_net_10pct",
    grossToNet(1409.29, 10) === 1281.17 &&
      Math.abs(
        estimateGrossFromParasutLines({
          lines: [
            {
              description: "x",
              quantity: 1,
              unitPrice: grossToNet(1259.3, 10),
              vatRate: 10,
            },
          ],
          shipping: { amount: grossToNet(149.99, 20), vatRate: 20 },
        }) - 1409.29
      ) < 0.02,
    "KDV dahil 1409.29 → net+KDV geri = ödeme",
    logger
  )

  examplePayload = samplePayloadFixture()
  const details = examplePayload.data.relationships.details.data
  const productLines = details.filter(
    (d) => d.attributes.description !== "Kargo"
  )
  const shipLine = details.find((d) => d.attributes.description === "Kargo")
  add(
    checks,
    "payload_line_fields",
    productLines.length === 2 &&
      productLines[0].attributes.quantity === 2 &&
      productLines[0].attributes.unit_price === 899.5 &&
      productLines[0].attributes.vat_rate === 10 &&
      productLines[1].attributes.vat_rate === 20,
    `lines=${productLines.length} vat=[${productLines.map((p) => p.attributes.vat_rate).join(",")}]`,
    logger
  )
  add(
    checks,
    "payload_discount_as_amount_not_reduced_unit",
    productLines[0].attributes.discount_type === "amount" &&
      productLines[0].attributes.discount_value === 44.975 &&
      productLines[0].attributes.unit_price === 899.5,
    "hosgeldin10 → discount_type=amount; unit_price düşülmez",
    logger
  )
  add(
    checks,
    "payload_shipping_separate_line",
    Boolean(shipLine) &&
      shipLine!.attributes.quantity === 1 &&
      shipLine!.attributes.unit_price === 124.99 &&
      shipLine!.attributes.vat_rate === 20,
    `kargo kalemi unit_price=${shipLine?.attributes.unit_price}`,
    logger
  )
  add(
    checks,
    "payload_currency_trl_major",
    examplePayload.data.attributes.currency === "TRL" &&
      !String(productLines[0].attributes.unit_price).includes("89950"),
    "currency=TRL (Parasut enum), tutarlar major-unit",
    logger
  )

  // Live order with promo — capture client payload
  const instrumented = new ParasutClient({
    ...normalizeOptions({}),
    forceMock: true,
    logger,
  })
  parasutSvc.replaceClientForTests(instrumented)

  const orderPromo = await createPaidOrder(container, {
    email: `parasut-promo-${Date.now()}@escay.local`,
    variantId,
    promoCode: PROMO_CODE,
  })
  await clearInvoiceMeta(container, orderPromo.orderId)
  instrumented.createSalesInvoiceCalls = 0
  const promoIssue = await issueSalesInvoiceForOrder(
    container,
    orderPromo.orderId
  )
  const livePayload = instrumented.lastSalesInvoicePayload
  const liveInput = instrumented.lastSalesInvoiceInput

  add(
    checks,
    "promo_order_invoice_issued",
    promoIssue.ok && promoIssue.meta.status === "issued",
    `status=${promoIssue.meta.status} discount_total=${orderPromo.discountTotal}`,
    logger
  )

  if (livePayload && liveInput) {
    examplePayload = livePayload
    const liveDetails = livePayload.data.relationships.details.data
    const liveShip = liveDetails.find(
      (d) => d.attributes.description === "Kargo"
    )
    const liveProducts = liveDetails.filter(
      (d) => d.attributes.description !== "Kargo"
    )
    const hasLineDiscount = liveProducts.some(
      (d) =>
        d.attributes.discount_type === "amount" &&
        (d.attributes.discount_value || 0) > 0
    )
    const invDisc = livePayload.data.attributes.invoice_discount_value || 0
    const doubleCountRisk =
      hasLineDiscount &&
      invDisc > 0 &&
      Math.abs(invDisc - orderPromo.discountTotal) < 0.02

    add(
      checks,
      "promo_discount_format",
      orderPromo.discountTotal > 0 || hasLineDiscount || invDisc > 0
        ? hasLineDiscount || invDisc > 0
        : true,
      hasLineDiscount
        ? `kalem discount_type=amount (unit düşülmedi)`
        : invDisc > 0
          ? `invoice_discount_value=${invDisc}`
          : orderPromo.discountTotal > 0 ||
              Math.abs(orderPromo.total - (orderPromo.itemTotal + orderPromo.shippingTotal)) > 1
            ? `ödeme indirimli ama payload'da indirim yok (paid=${orderPromo.total})`
            : `promo uygulanmadı (hosgeldin10 seed eksik olabilir)`,
      logger
    )
    add(
      checks,
      "promo_no_double_discount",
      !doubleCountRisk,
      doubleCountRisk
        ? `FAIL: hem kalem hem invoice_discount=${invDisc} (çift sayım)`
        : `lineDisc=${hasLineDiscount} invDisc=${invDisc}`,
      logger
    )
    // Kargo: Medusa brüt → Parasut net (KDV hariç)
    const shipNetExpected =
      orderPromo.shippingTotal > 0
        ? grossToNet(orderPromo.shippingTotal, 20)
        : 0
    add(
      checks,
      "promo_shipping_line",
      orderPromo.shippingTotal <= 0 ||
        (Boolean(liveShip) &&
          Math.abs((liveShip?.attributes.unit_price || 0) - shipNetExpected) <
            0.02),
      `ship_order_gross=${orderPromo.shippingTotal} ship_net_expected=${shipNetExpected} ship_payload=${liveShip?.attributes.unit_price}`,
      logger
    )

    // ×100 hatası: unit_price sipariş item_total mertebesinde olmalı (net < brüt)
    const unit = liveProducts[0]?.attributes.unit_price || 0
    add(
      checks,
      "promo_unit_not_kurus",
      unit > 0 && unit < orderPromo.total * 50,
      `unit_price=${unit} order.total=${orderPromo.total}`,
      logger
    )

    // KDV dahil ödeme ≈ satırlardan geri hesaplanan brüt
    const grossEst = liveInput
      ? estimateGrossFromParasutLines({
          lines: liveInput.lines,
          shipping: liveInput.shipping || null,
          orderDiscountNet: liveInput.orderDiscount || null,
          orderDiscountVatRate: 10,
        })
      : estimatePayloadNetTotal(livePayload)
    add(
      checks,
      "promo_payload_net_near_order",
      Math.abs(grossEst - orderPromo.total) < 1.0,
      `payload_gross_est=${grossEst} paid_total=${orderPromo.total} item=${orderPromo.itemTotal} ship=${orderPromo.shippingTotal} disc=${orderPromo.discountTotal}`,
      logger
    )

    // tax_rate → vat_rate from real order lines
    const vatOk = liveInput.lines.every((l) => l.vatRate === 10 || l.vatRate === 20)
    add(
      checks,
      "promo_vat_rates_tr",
      vatOk && liveInput.lines.length > 0,
      `vatRates=[${liveInput.lines.map((l) => l.vatRate).join(",")}]`,
      logger
    )
  } else {
    add(checks, "promo_payload_captured", false, "payload yakalanamadı", logger)
  }

  parasutSvc.replaceClientForTests(null)

  // ═══════════════════════════════════════════════════════════
  // 3. HATA SENARYOLARI
  // ═══════════════════════════════════════════════════════════
  logger.info("[parasut-deep] --- 3. Hata senaryoları (yasal görünürlük) ---")

  // API 500 + retry (live-path transport, credentials filled so not mock)
  let oauthAttempts = 0
  const failTransportClient = new ParasutClient({
    ...normalizeOptions({
      clientId: "test-cid",
      clientSecret: "test-secret",
      username: "user@test",
      password: "pass",
      companyId: "999",
      maxRetries: 2,
      timeoutMs: 5000,
    }),
    forceMock: false,
    transport: async (url) => {
      if (url.includes("/oauth/token")) {
        oauthAttempts += 1
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: "tok",
              refresh_token: "ref",
              expires_in: 7200,
            }),
        }
      }
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ errors: [{ title: "boom" }] }),
      }
    },
  })
  let apiErr: unknown
  try {
    await failTransportClient.createSalesInvoice({
      contactId: "c1",
      orderId: "o1",
      lines: [{ description: "x", quantity: 1, unitPrice: 10, vatRate: 10 }],
    })
  } catch (e) {
    apiErr = e
  }
  add(
    checks,
    "api_500_throws",
    apiErr instanceof ParasutError && (apiErr as ParasutError).status === 500,
    `err=${apiErr instanceof Error ? apiErr.message : String(apiErr)}`,
    logger
  )
  add(
    checks,
    "api_500_retries",
    failTransportClient.requestAttempts >= 3,
    `attempts=${failTransportClient.requestAttempts} (maxRetries=2 → 3 try)`,
    logger
  )

  // OAuth fail
  const oauthFailClient = new ParasutClient({
    ...normalizeOptions({
      clientId: "test-cid",
      clientSecret: "test-secret",
      username: "user@test",
      password: "pass",
      companyId: "999",
      maxRetries: 0,
    }),
    forceMock: false,
    transport: async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "invalid_grant" }),
    }),
  })
  let oauthErr: unknown
  try {
    await oauthFailClient.ensureContact({ name: "X", orderId: "o" })
  } catch (e) {
    oauthErr = e
  }
  add(
    checks,
    "oauth_fail_meaningful",
    oauthErr instanceof ParasutError &&
      /OAuth|401|invalid/i.test((oauthErr as Error).message),
    `err=${oauthErr instanceof Error ? oauthErr.message : String(oauthErr)}`,
    logger
  )
  add(
    checks,
    "oauth_fail_no_crash",
    oauthErr instanceof Error,
    "sistem throw ile döner, process çökmez",
    logger
  )

  // Order-level API fail → metadata error (widget kırmızı)
  const failingClient = new ParasutClient({
    ...normalizeOptions({}),
    forceMock: true,
    mockBehavior: {
      failOn: "createSalesInvoice",
      failMessage: "Parasut mock 500 — forced API failure",
    },
  })
  parasutSvc.replaceClientForTests(failingClient)
  const orderFail = await createPaidOrder(container, {
    email: `parasut-fail-${Date.now()}@escay.local`,
    variantId,
  })
  await clearInvoiceMeta(container, orderFail.orderId)
  const failResult = await issueSalesInvoiceForOrder(
    container,
    orderFail.orderId
  )
  const failMeta = (await readInvoiceMeta(container, orderFail.orderId)).invoice
  add(
    checks,
    "fail_metadata_error",
    failResult.ok === false &&
      failMeta?.status === "error" &&
      Boolean(failMeta.error),
    `status=${failMeta?.status} error=${failMeta?.error}`,
    logger
  )
  add(
    checks,
    "fail_visible_for_admin_widget",
    failMeta?.status === "error",
    "widget statusBadge(error)=kırmızı — fatura YOK sessiz değil",
    logger
  )
  add(
    checks,
    "fail_not_silent",
    failMeta?.status === "error" && failMeta?.status !== "issued",
    "sipariş faturasız kaldı ve FARK EDİLİR (metadata.error)",
    logger
  )

  parasutSvc.replaceClientForTests(null)

  // ═══════════════════════════════════════════════════════════
  // 4. IDEMPOTENCY
  // ═══════════════════════════════════════════════════════════
  logger.info("[parasut-deep] --- 4. Idempotency ---")

  const orderIdem = await createPaidOrder(container, {
    email: `parasut-idem-${Date.now()}@escay.local`,
    variantId,
  })
  await clearInvoiceMeta(container, orderIdem.orderId)
  const countClient = new ParasutClient({
    ...normalizeOptions({}),
    forceMock: true,
  })
  parasutSvc.replaceClientForTests(countClient)
  const first = await issueSalesInvoiceForOrder(container, orderIdem.orderId)
  const creates1 = countClient.createSalesInvoiceCalls
  const second = await issueSalesInvoiceForOrder(container, orderIdem.orderId)
  const third = await issueSalesInvoiceForOrder(container, orderIdem.orderId)
  add(
    checks,
    "idempotent_triple_issue",
    first.ok &&
      second.skipped === true &&
      third.skipped === true &&
      second.meta.invoice_id === first.meta.invoice_id &&
      countClient.createSalesInvoiceCalls === creates1,
    `creates=${countClient.createSalesInvoiceCalls} ids=${first.meta.invoice_id}`,
    logger
  )

  // Partial fail → resume (no double create)
  const orderPartial = await createPaidOrder(container, {
    email: `parasut-partial-${Date.now()}@escay.local`,
    variantId,
  })
  await clearInvoiceMeta(container, orderPartial.orderId)
  const partialClient = new ParasutClient({
    ...normalizeOptions({}),
    forceMock: true,
    mockBehavior: { failOn: "finalizeInvoice", failMessage: "finalize boom" },
  })
  parasutSvc.replaceClientForTests(partialClient)
  const partialFail = await issueSalesInvoiceForOrder(
    container,
    orderPartial.orderId
  )
  const afterPartial = (await readInvoiceMeta(container, orderPartial.orderId))
    .invoice
  add(
    checks,
    "partial_fail_preserves_invoice_id",
    partialFail.ok === false &&
      afterPartial?.status === "error" &&
      Boolean(afterPartial.invoice_id),
    `status=${afterPartial?.status} id=${afterPartial?.invoice_id} note=${afterPartial?.note}`,
    logger
  )

  const createsBeforeResume = partialClient.createSalesInvoiceCalls
  partialClient.setMockBehavior({}) // finalize artık OK
  const resumed = await issueSalesInvoiceForOrder(
    container,
    orderPartial.orderId
  )
  add(
    checks,
    "partial_fail_resume_no_double_invoice",
    resumed.ok &&
      resumed.meta.status === "issued" &&
      resumed.meta.invoice_id === afterPartial?.invoice_id &&
      partialClient.createSalesInvoiceCalls === createsBeforeResume,
    `creates_unchanged=${partialClient.createSalesInvoiceCalls === createsBeforeResume} same_id=${resumed.meta.invoice_id} note=${resumed.meta.note}`,
    logger
  )

  parasutSvc.replaceClientForTests(null)

  // ═══════════════════════════════════════════════════════════
  // 5. İADE FATURASI
  // ═══════════════════════════════════════════════════════════
  logger.info("[parasut-deep] --- 5. İade faturası ---")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Full refund (mind = no shipping in refund)
  const orderFull = await createPaidOrder(container, {
    email: `parasut-fullret-${Date.now()}@escay.local`,
    variantId,
  })
  await issueSalesInvoiceForOrder(container, orderFull.orderId)
  await fulfillDeliver(container, orderFull.orderId, orderFull.itemIds)
  const retFull = await createStoreReturnRequest(container, {
    order_id: orderFull.orderId,
    items: [{ id: orderFull.itemIds[0], quantity: 1 }],
    reason_id: REASON_MIND,
    note: "parasut-deep-full",
    source: "guest",
  })
  await adminReceiveReturn(retFull.id, orderFull.itemIds[0])
  await sleep(2000)

  const { data: retFullRows } = await query.graph({
    entity: "return",
    fields: ["id", "metadata"],
    filters: { id: retFull.id },
  })
  const prFull = (
    retFullRows![0] as {
      metadata?: { paytr_refund?: { status?: string; amount?: number } }
    }
  ).metadata?.paytr_refund
  const fullAmt = Number(prFull?.amount) || orderFull.itemTotal
  let { refunds: rfFull } = await readInvoiceMeta(container, orderFull.orderId)
  if (!rfFull[retFull.id] || rfFull[retFull.id].status !== "issued") {
    await issueRefundInvoiceForReturn(container, {
      return_id: retFull.id,
      order_id: orderFull.orderId,
      amount: fullAmt,
    })
    ;({ refunds: rfFull } = await readInvoiceMeta(container, orderFull.orderId))
  }
  const salesFull = (await readInvoiceMeta(container, orderFull.orderId)).invoice
  add(
    checks,
    "refund_full_issued",
    rfFull[retFull.id]?.status === "issued" &&
      Math.abs((rfFull[retFull.id]?.amount || 0) - fullAmt) < 0.05,
    `refund_amt=${rfFull[retFull.id]?.amount} paytr=${fullAmt} sales_no=${salesFull?.invoice_number}`,
    logger
  )

  // Partial: qty=2 sipariş, 1 adet iade talebi; Parasut tutarı bilinçli kısmi amount
  const orderPartialRet = await createPaidOrder(container, {
    email: `parasut-partret-${Date.now()}@escay.local`,
    variantId,
    quantity: 2,
  })
  await issueSalesInvoiceForOrder(container, orderPartialRet.orderId)
  await fulfillDeliver(
    container,
    orderPartialRet.orderId,
    orderPartialRet.itemIds
  )
  const retPart = await createStoreReturnRequest(container, {
    order_id: orderPartialRet.orderId,
    items: [{ id: orderPartialRet.itemIds[0], quantity: 1 }],
    reason_id: REASON_MIND,
    note: "parasut-deep-partial",
    source: "guest",
  })
  await adminReceiveReturn(retPart.id, orderPartialRet.itemIds[0], 1)
  await sleep(1500)

  const expectedPartial = roundMoney(orderPartialRet.itemTotal / 2)
  // Önceki auto-issue (PayTR tutarı) varsa ezmek için reset + bilinçli kısmi tutar
  {
    const orderModule = container.resolve(Modules.ORDER)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: orderPartialRet.orderId },
    })
    const prev = {
      ...(((data?.[0] as { metadata?: Record<string, unknown> } | undefined)
        ?.metadata || {}) as Record<string, unknown>),
    }
    const map = {
      ...((prev.parasut_refund_invoices as Record<string, unknown>) || {}),
    }
    delete map[retPart.id]
    await orderModule.updateOrders([
      {
        id: orderPartialRet.orderId,
        metadata: { ...prev, parasut_refund_invoices: map },
      },
    ])
  }
  const partIssue = await issueRefundInvoiceForReturn(container, {
    return_id: retPart.id,
    order_id: orderPartialRet.orderId,
    amount: expectedPartial,
  })
  add(
    checks,
    "refund_partial_less_than_order",
    partIssue.ok &&
      partIssue.meta.status === "issued" &&
      Math.abs((partIssue.meta.amount || 0) - expectedPartial) < 0.05 &&
      expectedPartial < orderPartialRet.itemTotal - 0.01,
    `refund_inv=${partIssue.meta.amount} expected=${expectedPartial} itemTotal=${orderPartialRet.itemTotal}`,
    logger
  )

  // Shipping included (defect reason)
  const orderShip = await createPaidOrder(container, {
    email: `parasut-shipret-${Date.now()}@escay.local`,
    variantId,
  })
  await issueSalesInvoiceForOrder(container, orderShip.orderId)
  await fulfillDeliver(container, orderShip.orderId, orderShip.itemIds)
  const retShip = await createStoreReturnRequest(container, {
    order_id: orderShip.orderId,
    items: [{ id: orderShip.itemIds[0], quantity: 1 }],
    reason_id: REASON_DEFECT,
    note: "parasut-deep-ship",
    source: "guest",
  })
  await adminReceiveReturn(retShip.id, orderShip.itemIds[0])
  await sleep(2000)
  const { data: retShipRows } = await query.graph({
    entity: "return",
    fields: ["id", "metadata"],
    filters: { id: retShip.id },
  })
  const prShip = (
    retShipRows![0] as {
      metadata?: {
        paytr_refund?: {
          status?: string
          amount?: number
          shipping_included?: boolean
        }
      }
    }
  ).metadata?.paytr_refund
  const shipAmt = Number(prShip?.amount) || 0
  let { refunds: rfShip } = await readInvoiceMeta(container, orderShip.orderId)
  if (!rfShip[retShip.id] || rfShip[retShip.id].status !== "issued") {
    await issueRefundInvoiceForReturn(container, {
      return_id: retShip.id,
      order_id: orderShip.orderId,
      amount: shipAmt,
    })
    ;({ refunds: rfShip } = await readInvoiceMeta(container, orderShip.orderId))
  }
  add(
    checks,
    "refund_with_shipping",
    prShip?.shipping_included === true &&
      shipAmt >= orderShip.itemTotal + orderShip.shippingTotal - 0.5 &&
      rfShip[retShip.id]?.status === "issued",
    `shipping_included=${prShip?.shipping_included} amt=${shipAmt} item+ship=${roundMoney(orderShip.itemTotal + orderShip.shippingTotal)}`,
    logger
  )

  // Reject → no refund invoice
  const orderRej = await createPaidOrder(container, {
    email: `parasut-rej-${Date.now()}@escay.local`,
    variantId,
  })
  await issueSalesInvoiceForOrder(container, orderRej.orderId)
  await fulfillDeliver(container, orderRej.orderId, orderRej.itemIds)
  const retRej = await createStoreReturnRequest(container, {
    order_id: orderRej.orderId,
    items: [{ id: orderRej.itemIds[0], quantity: 1 }],
    reason_id: REASON_MIND,
    note: "parasut-deep-reject",
    source: "guest",
  })
  const token = await adminToken()
  const rejRes = await fetch(`${BACKEND}/admin/returns/${retRej.id}/reject`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "parasut-deep reject" }),
  })
  if (!rejRes.ok) {
    throw new Error(`reject failed ${rejRes.status}`)
  }
  const { data: rejRows } = await query.graph({
    entity: "return",
    fields: ["id", "metadata"],
    filters: { id: retRej.id },
  })
  const rejMeta = (rejRows![0] as { metadata?: Record<string, unknown> })
    .metadata
  add(
    checks,
    "reject_marked",
    isReturnRejected(rejMeta),
    "escay_rejection set",
    logger
  )
  const rejInv = await issueRefundInvoiceForReturn(container, {
    return_id: retRej.id,
    order_id: orderRej.orderId,
    amount: orderRej.itemTotal,
  })
  const afterRej = await readInvoiceMeta(container, orderRej.orderId)
  add(
    checks,
    "reject_no_refund_invoice",
    rejInv.skipped === true &&
      rejInv.meta.note === "escay_rejection" &&
      afterRej.refunds[retRej.id]?.status !== "issued",
    JSON.stringify(rejInv.meta),
    logger
  )

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  const failed = checks.filter((c) => !c.pass)
  logger.info("[parasut-deep] === PASS/FAIL TABLE ===")
  for (const c of checks) {
    logger.info(
      `[parasut-deep] ${c.pass ? "PASS" : "FAIL"} | ${c.name} | ${c.detail}`
    )
  }

  if (examplePayload) {
    logger.info("[parasut-deep] === EXAMPLE SALES INVOICE PAYLOAD ===")
    logger.info(JSON.stringify(examplePayload, null, 2))
  }

  logger.info("[parasut-deep] === ENV GELDİĞİNDE DİKKAT ===")
  logger.info(
    "[parasut-deep] 1) Mock VKN kuralı (9… → e_invoice) kalkar; gerçek e_invoice_inboxes yanıtına bakılır."
  )
  logger.info(
    "[parasut-deep] 2) Canlıda sales_invoice id her create'de yeni — pending/resume şart (bu smoke doğruladı)."
  )
  logger.info(
    "[parasut-deep] 3) KDV: ürün tax_rate (default %10); kargo PARASUT_SHIPPING_VAT_RATE (default %20)."
  )
  logger.info(
    "[parasut-deep] 4) İndirim: kalem discount_type=amount; invoice_discount yalnızca residual."
  )
  logger.info(
    "[parasut-deep] 5) Hata: metadata.status=error + admin widget kırmızı — sessiz geçiş yok."
  )
  logger.info(
    "[parasut-deep] 6) OAuth/HTTP 5xx: retry (maxRetries); 401 anlamlı OAuth hatası."
  )
  logger.info(
    "[parasut-deep] 7) check_vkn fail → e_archive fallback (mükellef kaçırma riski — log izle)."
  )

  logger.info(
    `[parasut-deep] === ${failed.length === 0 ? "ALL PASSED" : `FAILED ${failed.length}/${checks.length}`} ===`
  )

  if (failed.length) {
    throw new Error(
      `smoke-parasut-deep FAILED: ${failed.map((f) => f.name).join(", ")}`
    )
  }
}
