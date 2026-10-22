/**
 * PayTR Step 2 — callback simülasyonu (gerçek PayTR'a istek YOK).
 *
 * Staging'de gerçek sipariş kurar (cart → PayTR session → cart.complete) ve
 * PayTR'ın göndereceği bildirimi kendi /paytr/callback endpoint'imize POST'lar.
 * Session açılırken backend get-token atar: PAYTR_MOCK=1 ise stub, değilse
 * gerçek PayTR'a test_mode=1 (servis PAYTR_OID_PREFIX doluyken 0'ı reddeder).
 *
 * Senaryolar:
 *  1. success        → "OK", ödeme captured, stok rezerve kalır
 *  2. success tekrar → "OK", ikinci capture / sipariş / rezervasyon yok
 *  3. failed         → "OK", sipariş canceled, rezervasyon serbest
 *  4. yanlış hash    → "bad hash", sipariş değişmez (sonra failed ile temizlenir)
 *  5. bilinmeyen oid → "OK", no-op (Script A'nın oid'i argüman olarak verilebilir)
 *  6. iptal sonrası success → capture yok, compensated + mock iade
 *  8. tutar uyuşmazlığı → capture yok, compensated
 *
 *   PAYTR_OID_PREFIX=STG PAYTR_TEST_MODE=1 \
 *     npx medusa exec ./src/scripts/test-paytr-callback.ts [script-a-oid]
 *
 * Backend (MEDUSA_BACKEND_URL) aynı .env ile ayakta olmalı — callback hash'i
 * backend'in PAYTR_MERCHANT_KEY/SALT'ı ile doğrulanır.
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
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows"
import { computeCallbackHash, paytrOidPrefix } from "../modules/paytr/hash"
import { cancelUnpaidOrderIfSafe } from "../modules/paytr/order-guards"
import {
  isMockMode as isParasutMockMode,
  isParasutDryRun,
  normalizeOptions as normalizeParasutOptions,
} from "../modules/parasut/options"
import { carrierTestMode, isCarrierConfigured } from "../modules/carrier/registry"

const BACKEND = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
const PROD_HOSTS = ["api.esteacay.com", "market.esteacay.com", "www.market.esteacay.com"]
const PAYTR_PROVIDER_ID = "pp_paytr_paytr"
const PAID = new Set(["completed", "authorized", "partially_authorized", "partially_captured"])

type Check = { scenario: string; name: string; pass: boolean; detail: string }
const checks: Check[] = []

function check(scenario: string, name: string, pass: boolean, detail = "") {
  checks.push({ scenario, name, pass, detail })
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function refuse(message: string): never {
  throw new Error(`REDDEDİLDİ: ${message}`)
}

function preflight() {
  const host = new URL(BACKEND).hostname
  if (PROD_HOSTS.includes(host)) refuse(`MEDUSA_BACKEND_URL prod (${host}).`)

  const mock = process.env.PAYTR_MOCK === "1" || process.env.PAYTR_MOCK === "true"
  const prefix = paytrOidPrefix()
  if ((!prefix || prefix === "M") && !mock) {
    refuse('PAYTR_OID_PREFIX staging öneki olmalı (ör. "STG").')
  }

  const testMode = (process.env.PAYTR_TEST_MODE ?? "").trim()
  if (!mock && testMode !== "1") {
    refuse(`PAYTR_TEST_MODE="${testMode || "(boş)"}" — gerçek get-token yalnızca 1 ile.`)
  }

  const parasut = normalizeParasutOptions({
    clientId: process.env.PARASUT_CLIENT_ID,
    clientSecret: process.env.PARASUT_CLIENT_SECRET,
    username: process.env.PARASUT_USERNAME,
    password: process.env.PARASUT_PASSWORD,
    companyId: process.env.PARASUT_COMPANY_ID,
    dryRun: process.env.PARASUT_DRY_RUN,
  })
  if (!isParasutMockMode(parasut) && !isParasutDryRun(parasut)) {
    refuse("Paraşüt canlı kimlikli ve PARASUT_DRY_RUN kapalı — capture gerçek fatura keser.")
  }

  if (isCarrierConfigured() && !carrierTestMode()) {
    refuse("Kargo adaptörü canlı (SHIPPING_CARRIER_TEST_MODE=false) — capture gerçek kargo açar.")
  }

  return { prefix: prefix || "M", mock }
}

function callbackHash(oid: string, status: string, amount: string) {
  return computeCallbackHash({
    merchantOid: oid,
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
    status,
    totalAmount: amount,
    merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
  })
}

async function postCallback(input: {
  oid: string
  amount: string
  status: "success" | "failed"
  hash?: string
}) {
  const body = new URLSearchParams({
    merchant_oid: input.oid,
    status: input.status,
    total_amount: input.amount,
    hash: input.hash ?? callbackHash(input.oid, input.status, input.amount),
  })
  if (input.status === "failed") {
    body.set("failed_reason_code", "6")
    body.set("failed_reason_msg", "STG simulated failure")
  }
  const res = await fetch(`${BACKEND}/paytr/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  return { http: res.status, text: (await res.text()).trim() }
}

type InventoryService = {
  listInventoryLevels: (
    f: Record<string, unknown>
  ) => Promise<{ stocked_quantity: number; reserved_quantity: number }[]>
  listReservationItems: (
    f: Record<string, unknown>
  ) => Promise<{ id: string; quantity: number }[]>
}

async function stockOf(container: MedusaContainer, inventoryItemId: string) {
  const inventory = container.resolve(Modules.INVENTORY) as unknown as InventoryService
  const levels = await inventory.listInventoryLevels({ inventory_item_id: inventoryItemId })
  const stocked = levels.reduce((s, l) => s + Number(l.stocked_quantity || 0), 0)
  const reserved = levels.reduce((s, l) => s + Number(l.reserved_quantity || 0), 0)
  return { stocked, reserved, available: stocked - reserved }
}

async function reservationsFor(container: MedusaContainer, lineItemId: string) {
  const inventory = container.resolve(Modules.INVENTORY) as unknown as InventoryService
  const rows = await inventory.listReservationItems({ line_item_id: lineItemId })
  return rows.reduce((s, r) => s + Number(r.quantity || 0), 0)
}

async function pickVariant(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "manage_inventory", "inventory_items.inventory_item_id"],
    pagination: { take: 200 },
  })
  const preferred = process.env.TEST_VARIANT_ID
  const rows = (data || []) as {
    id: string
    sku?: string
    manage_inventory?: boolean
    inventory_items?: { inventory_item_id?: string }[]
  }[]
  rows.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
  for (const v of rows) {
    const inventoryItemId = v.inventory_items?.[0]?.inventory_item_id
    if (!v.manage_inventory || !inventoryItemId) continue
    const stock = await stockOf(container, inventoryItemId)
    if (stock.available >= 3) return { variantId: v.id, sku: v.sku, inventoryItemId }
  }
  throw new Error("Stok takipli ve en az 3 adet müsait variant bulunamadı (TEST_VARIANT_ID verin).")
}

type TestOrder = {
  orderId: string
  lineItemId: string
  paymentCollectionId: string
  oid: string
  kurus: string
  email: string
}

async function createOrder(
  container: MedusaContainer,
  variantId: string,
  label: string
): Promise<TestOrder> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const email = `stg-paytr-${label}-${Date.now()}@escay.test`

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const region =
    ((regions || []) as { id: string; currency_code?: string }[]).find(
      (r) => r.currency_code === "try"
    ) || (regions![0] as { id: string; currency_code?: string })

  const { result: cart } = await createCartWorkflow(container).run({
    input: { region_id: region.id, email, currency_code: region.currency_code || "try" },
  })
  const cartId = (cart as { id: string }).id

  await addToCartWorkflow(container).run({
    input: { cart_id: cartId, items: [{ variant_id: variantId, quantity: 1 }] },
  })
  const address = {
    first_name: "STG",
    last_name: "PayTR",
    address_1: "Staging Test Sk. 1",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34000",
    phone: "+905000000000",
    province: "İstanbul",
    metadata: { district: "Şişli" },
  }
  await updateCartWorkflow(container).run({
    input: { id: cartId, shipping_address: address, billing_address: address },
  })

  const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id"] })
  await addShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cartId, options: [{ id: (options![0] as { id: string }).id }] },
  })

  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
  const { data: cartPay } = await query.graph({
    entity: "cart",
    fields: ["payment_collection.id"],
    filters: { id: cartId },
  })
  const paymentCollectionId = (cartPay![0] as { payment_collection: { id: string } })
    .payment_collection.id
  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: paymentCollectionId,
      provider_id: PAYTR_PROVIDER_ID,
      data: {
        customer_email: email,
        ...(process.env.PAYTR_USER_IP ? { user_ip: process.env.PAYTR_USER_IP } : {}),
      },
    },
  })

  const { result } = await completeCartWorkflow(container).run({ input: { id: cartId } })
  const orderId = (result as { id: string }).id

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "items.id"],
    filters: { id: orderId },
  })
  const lineItemId = (orders![0] as { items: { id: string }[] }).items[0].id

  const session = await sessionOf(container, paymentCollectionId)
  return {
    orderId,
    lineItemId,
    paymentCollectionId,
    oid: String(session.data?.merchant_oid || ""),
    kurus: String(Math.round(Number(session.amount) * 100)),
    email,
  }
}

async function sessionOf(container: MedusaContainer, paymentCollectionId: string) {
  const payment = container.resolve(Modules.PAYMENT) as unknown as {
    listPaymentSessions: (
      f: Record<string, unknown>
    ) => Promise<{ id: string; amount: unknown; data?: Record<string, unknown> }[]>
  }
  const sessions = await payment.listPaymentSessions({
    payment_collection_id: paymentCollectionId,
    provider_id: PAYTR_PROVIDER_ID,
  })
  if (!sessions[0]) throw new Error(`PayTR session yok — collection=${paymentCollectionId}`)
  return sessions[0]
}

async function orderState(container: MedusaContainer, orderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_collections.status",
      "payment_collections.payments.id",
      "payment_collections.payments.captures.id",
    ],
    filters: { id: orderId },
  })
  const row = (data || [])[0] as {
    status?: string
    payment_collections?: {
      status?: string
      payments?: { captures?: { id: string }[] }[]
    }[]
  }
  const collections = row?.payment_collections || []
  const payments = collections.flatMap((c) => c.payments || [])
  const captures = payments.reduce((n, p) => n + (p.captures?.length || 0), 0)
  return {
    status: row?.status || "",
    paymentStatus: collections.map((c) => c.status || "").join(",") || "",
    payments: payments.length,
    captures,
  }
}

async function countOrdersByEmail(container: MedusaContainer, email: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ["id"], filters: { email } })
  return (data || []).length
}

export default async function testPaytrCallback({ container, args }: ExecArgs) {
  const { prefix, mock } = preflight()
  const health = await fetch(`${BACKEND}/health`).catch(() => null)
  if (!health?.ok) throw new Error(`Backend erişilemiyor: ${BACKEND}/health`)

  console.log("\n=== PayTR callback simülasyonu (Step 2) ===")
  console.log(`  backend   : ${BACKEND}/paytr/callback`)
  console.log(`  oid öneki : ${prefix}`)
  console.log(
    `  get-token : ${mock ? "PAYTR_MOCK=1 (stub, PayTR'a istek yok)" : "gerçek PayTR, test_mode=1"}`
  )

  const { variantId, sku, inventoryItemId } = await pickVariant(container)
  const base = await stockOf(container, inventoryItemId)
  console.log(`  variant   : ${variantId} (${sku ?? "-"}) stok=${JSON.stringify(base)}`)

  // ── 1. success ────────────────────────────────────────────────────
  console.log("\n── 1. success")
  const a = await createOrder(container, variantId, "ok")
  check("1", "merchant_oid staging önekli", a.oid.startsWith(prefix), a.oid)
  const aPlaced = await stockOf(container, inventoryItemId)
  check(
    "1",
    "cart.complete → stok rezerve",
    (await reservationsFor(container, a.lineItemId)) === 1 &&
      aPlaced.reserved === base.reserved + 1,
    `reserved ${base.reserved}→${aPlaced.reserved}`
  )
  const r1 = await postCallback({ oid: a.oid, amount: a.kurus, status: "success" })
  check("1", 'endpoint "OK"', r1.http === 200 && r1.text === "OK", `${r1.http} ${r1.text}`)
  await sleep(2500)
  const a1 = await orderState(container, a.orderId)
  check(
    "1",
    "ödeme captured",
    PAID.has(a1.paymentStatus) && a1.captures > 0,
    `payment_collection=${a1.paymentStatus}`
  )
  check("1", "tek capture", a1.captures === 1, `captures=${a1.captures}`)
  const aSession = await sessionOf(container, a.paymentCollectionId)
  check(
    "1",
    "session callback_processed + paytr_status=success",
    aSession.data?.callback_processed === true && aSession.data?.paytr_status === "success"
  )
  check(
    "1",
    "rezervasyon duruyor (stok fulfillment'a kadar tutulur)",
    (await reservationsFor(container, a.lineItemId)) === 1
  )

  // ── 2. duplicate success ──────────────────────────────────────────
  console.log("\n── 2. aynı success tekrar")
  const r2 = await postCallback({ oid: a.oid, amount: a.kurus, status: "success" })
  check("2", 'endpoint "OK"', r2.http === 200 && r2.text === "OK", `${r2.http} ${r2.text}`)
  await sleep(1500)
  const a2 = await orderState(container, a.orderId)
  check("2", "ikinci capture yok", a2.captures === a1.captures, `captures=${a2.captures}`)
  check("2", "ikinci payment yok", a2.payments === a1.payments, `payments=${a2.payments}`)
  check("2", "tek sipariş", (await countOrdersByEmail(container, a.email)) === 1)
  const aDup = await stockOf(container, inventoryItemId)
  check("2", "çift stok düşümü yok", aDup.reserved === aPlaced.reserved, `reserved=${aDup.reserved}`)

  // ── 3. failed ─────────────────────────────────────────────────────
  console.log("\n── 3. failed")
  const beforeB = await stockOf(container, inventoryItemId)
  const b = await createOrder(container, variantId, "fail")
  const bPlaced = await stockOf(container, inventoryItemId)
  const r3 = await postCallback({ oid: b.oid, amount: b.kurus, status: "failed" })
  check("3", 'endpoint "OK"', r3.http === 200 && r3.text === "OK", `${r3.http} ${r3.text}`)
  await sleep(2500)
  const b1 = await orderState(container, b.orderId)
  check("3", "sipariş canceled", b1.status === "canceled", `status=${b1.status}`)
  check("3", "capture yok", b1.captures === 0, `captures=${b1.captures}`)
  const bAfter = await stockOf(container, inventoryItemId)
  check(
    "3",
    "rezervasyon serbest (stok geri)",
    (await reservationsFor(container, b.lineItemId)) === 0 &&
      bAfter.reserved === beforeB.reserved,
    `reserved ${beforeB.reserved}→${bPlaced.reserved}→${bAfter.reserved}`
  )

  // ── 4. bad hash ───────────────────────────────────────────────────
  console.log("\n── 4. yanlış hash")
  const c = await createOrder(container, variantId, "badhash")
  const r4 = await postCallback({
    oid: c.oid,
    amount: c.kurus,
    status: "success",
    hash: callbackHash(c.oid, "success", String(Number(c.kurus) + 1)),
  })
  check(
    "4",
    "imza reddedildi",
    r4.text === "PAYTR notification failed: bad hash",
    `${r4.http} ${r4.text}`
  )
  await sleep(1500)
  const c1 = await orderState(container, c.orderId)
  check(
    "4",
    "sipariş ödenmedi",
    !PAID.has(c1.paymentStatus) && c1.captures === 0 && c1.status !== "canceled",
    `status=${c1.status} payment_collection=${c1.paymentStatus}`
  )
  const cSession = await sessionOf(container, c.paymentCollectionId)
  check("4", "session işlenmedi", cSession.data?.callback_processed !== true)
  const rc = await postCallback({ oid: c.oid, amount: c.kurus, status: "failed" })
  await sleep(2500)
  const c2 = await orderState(container, c.orderId)
  check(
    "4",
    "temizlik: failed ile iptal + stok geri",
    rc.text === "OK" &&
      c2.status === "canceled" &&
      (await reservationsFor(container, c.lineItemId)) === 0,
    `status=${c2.status}`
  )

  // ── 5. unknown oid ────────────────────────────────────────────────
  console.log("\n── 5. bilinmeyen oid")
  const unknownOid = String(args?.[0] || `${prefix}${Date.now()}unknown`)
  const r5 = await postCallback({ oid: unknownOid, amount: "100", status: "success" })
  check("5", 'geçerli imza + session yok → "OK" no-op', r5.text === "OK", `${unknownOid} → ${r5.text}`)

  // Not: 6. adım backend'de PAYTR_LATE_SUCCESS_AUTO_REFUND=1 ister; yoksa iade yapılmaz
  // (paytr_status=success_on_canceled_order, manual_review=true).
  // ── 6. late success after cancel (cleanup simülasyonu) ──────────
  console.log("\n── 6. iptal sonrası geç success")
  const d = await createOrder(container, variantId, "late")
  const dCancel = await cancelUnpaidOrderIfSafe(container, d.orderId, "[stg-late]")
  check("6", "sipariş iptal (callback_processed yazılmadan)", dCancel.canceled === true)
  const r6 = await postCallback({ oid: d.oid, amount: d.kurus, status: "success" })
  check("6", 'endpoint "OK"', r6.http === 200 && r6.text === "OK", `${r6.http} ${r6.text}`)
  await sleep(1500)
  const d1 = await orderState(container, d.orderId)
  check("6", "iptal kaldı, capture yok", d1.status === "canceled" && d1.captures === 0, `status=${d1.status} captures=${d1.captures}`)
  const dSession = await sessionOf(container, d.paymentCollectionId)
  check(
    "6",
    "session compensated (capture yok)",
    dSession.data?.paytr_status === "compensated" &&
      dSession.data?.callback_processed === true &&
      dSession.data?.compensate_kind === "late_success_canceled"
  )
  check(
    "6",
    "iade referansı session'da",
    typeof dSession.data?.compensate_reference === "string" &&
      Boolean(dSession.data.compensate_reference)
  )

  // ── 8. amount mismatch ─────────────────────────────────────────
  console.log("\n── 8. tutar uyuşmazlığı")
  const e = await createOrder(container, variantId, "amt")
  const wrongKurus = String(Number(e.kurus) + 50)
  const r8 = await postCallback({ oid: e.oid, amount: wrongKurus, status: "success" })
  check("8", 'endpoint "OK"', r8.http === 200 && r8.text === "OK", `${r8.http} ${r8.text}`)
  await sleep(1500)
  const e1 = await orderState(container, e.orderId)
  check(
    "8",
    "ödeme alınmadı",
    !PAID.has(e1.paymentStatus) && e1.captures === 0,
    `payment_collection=${e1.paymentStatus}`
  )
  const eSession = await sessionOf(container, e.paymentCollectionId)
  check("8", "session compensated / amount_mismatch", eSession.data?.compensate_kind === "amount_mismatch")
  await cancelUnpaidOrderIfSafe(container, e.orderId, "[stg-amt]")

  const end = await stockOf(container, inventoryItemId)
  console.log(
    `\n  stok son: ${JSON.stringify(end)} (başlangıç reserved=${base.reserved}; ` +
      `+1 = senaryo 1'in ödenmiş siparişi ${a.orderId})`
  )

  const failed = checks.filter((c) => !c.pass)
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} geçti ===`)
  if (failed.length) {
    for (const f of failed) console.log(`  ✗ [${f.scenario}] ${f.name} ${f.detail}`)
    throw new Error(`${failed.length} kontrol başarısız`)
  }
}
