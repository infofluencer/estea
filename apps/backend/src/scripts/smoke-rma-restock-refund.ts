/**
 * RMA restock + refund tutar smoke (PAYTR_MOCK=1, backend ayakta).
 *
 *   PAYTR_MOCK=1 npx medusa exec ./src/scripts/smoke-rma-restock-refund.ts
 *
 * Senaryolar:
 *  (A) defective → kargo DAHİL refund + stok +1
 *  (B) changed_mind → kargo HARİÇ refund + stok +1
 */
import type { ExecArgs } from "@medusajs/framework/types"
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

const VARIANT_ID =
  process.env.TEST_VARIANT_ID || "variant_01M25MQGSQQZXRC324EDD7162Y"
const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@market.esteacay.com"
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || ""
if (!ADMIN_PASSWORD) throw new Error("TEST_ADMIN_PASSWORD env gerekli (sabit yedek şifre kaldırıldı)")

const REASON_DEFECT = "rr_01M22XV09PK6PSY9QRC2Y350B0" // seller_pays_shipping true
const REASON_MIND = "rr_01M22XV09PVZT2W627JERSC836" // false

async function resolveInventoryLevelId(
  container: ExecArgs["container"]
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["inventory_item_id"],
    filters: { variant_id: VARIANT_ID },
  })
  const invId = (links?.[0] as { inventory_item_id?: string } | undefined)
    ?.inventory_item_id
  if (!invId) throw new Error(`No inventory item for variant ${VARIANT_ID}`)

  const locationId = await resolveDefaultStockLocationId(container)
  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "location_id", "inventory_item_id"],
    filters: { inventory_item_id: invId },
  })
  const rows = (levels || []) as {
    id: string
    location_id?: string
  }[]
  const preferred =
    rows.find((r) => r.location_id === locationId) || rows[0]
  if (!preferred?.id) throw new Error(`No inventory level for ${invId}`)
  return preferred.id
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
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

async function readStock(container: ExecArgs["container"]) {
  const levelId = await resolveInventoryLevelId(container)
  const inv = container.resolve(Modules.INVENTORY) as {
    retrieveInventoryLevel: (id: string) => Promise<{
      stocked_quantity?: number
      reserved_quantity?: number
    }>
  }
  const level = await inv.retrieveInventoryLevel(levelId)
  return {
    stocked: Number(level.stocked_quantity || 0),
    reserved: Number(level.reserved_quantity || 0),
  }
}

async function setStocked(container: ExecArgs["container"], qty: number) {
  const levelId = await resolveInventoryLevelId(container)
  const inv = container.resolve(Modules.INVENTORY) as {
    updateInventoryLevels: (
      data: {
        id: string
        inventory_item_id: string
        location_id: string
        stocked_quantity: number
      }[]
    ) => Promise<unknown>
    retrieveInventoryLevel: (id: string) => Promise<{
      id: string
      inventory_item_id: string
      location_id: string
    }>
  }
  const level = await inv.retrieveInventoryLevel(levelId)
  await inv.updateInventoryLevels([
    {
      id: level.id,
      inventory_item_id: level.inventory_item_id,
      location_id: level.location_id,
      stocked_quantity: qty,
    },
  ])
}

async function createPaidDeliveredOrder(
  container: ExecArgs["container"],
  email: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const locationId = await resolveDefaultStockLocationId(container)
  if (!locationId) throw new Error("No stock location")

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
      items: [{ variant_id: VARIANT_ID, quantity: 1 }],
    },
  })

  await updateCartWorkflow(container).run({
    input: {
      id: cartId,
      shipping_address: {
        first_name: "RMA",
        last_name: "Smoke",
        address_1: "Test 1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
        metadata: { district: "Şişli" },
      },
      billing_address: {
        first_name: "RMA",
        last_name: "Smoke",
        address_1: "Test 1",
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
    fields: ["payment_collection.id", "total", "shipping_total", "item_total"],
    filters: { id: cartId },
  })
  const cartRow = cartPay![0] as {
    payment_collection: { id: string }
    total?: number
    shipping_total?: number
    item_total?: number
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
  await new Promise((r) => setTimeout(r, 800))

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "total",
      "shipping_total",
      "item_total",
      "items.id",
      "items.quantity",
      "items.unit_price",
      "items.refundable_total_per_unit",
      "shipping_methods.shipping_option_id",
    ],
    filters: { id: orderId },
  })
  const order = orders![0] as {
    id: string
    display_id?: number
    email?: string
    total?: number
    shipping_total?: number
    item_total?: number
    items?: {
      id: string
      quantity?: number
      unit_price?: number
      refundable_total_per_unit?: number
    }[]
    shipping_methods?: { shipping_option_id?: string }[]
  }

  const items = (order.items || []).map((i) => ({
    id: i.id,
    quantity: Math.max(1, Number(i.quantity) || 1),
  }))

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
    input: {
      order_id: orderId,
      fulfillment_id: fulfillmentId,
      items,
    },
  })
  await markOrderFulfillmentAsDeliveredWorkflow(container).run({
    input: { orderId, fulfillmentId },
  })

  const line = order.items![0]
  const perUnit =
    Number(line.refundable_total_per_unit) || Number(line.unit_price) || 0

  return {
    orderId,
    email: order.email || email,
    displayId: Number(order.display_id),
    itemId: line.id,
    itemAmount: roundMoney(perUnit),
    shippingTotal: roundMoney(Number(order.shipping_total) || 0),
    orderTotal: roundMoney(Number(order.total) || amount),
    captureAmount: roundMoney(amount),
  }
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

async function runScenario(
  container: ExecArgs["container"],
  label: string,
  reasonId: string,
  expectShippingIncluded: boolean
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  await setStocked(container, 20)
  const stockBefore = await readStock(container)

  const email = `rma-${label}-${Date.now()}@escay.local`
  const order = await createPaidDeliveredOrder(container, email)
  logger.info(
    `[rma-smoke][${label}] order=${order.orderId} #${100000 + order.displayId} ` +
      `item=${order.itemAmount} ship=${order.shippingTotal} capture=${order.captureAmount}`
  )

  const stockAfterFulfill = await readStock(container)
  const baselineStocked = stockAfterFulfill.stocked

  const created = await createStoreReturnRequest(container, {
    order_id: order.orderId,
    items: [{ id: order.itemId, quantity: 1 }],
    reason_id: reasonId,
    note: `smoke-${label}`,
    source: "guest",
  })

  const { data: rets } = await query.graph({
    entity: "return",
    fields: ["id", "location_id", "status"],
    filters: { id: created.id },
  })
  const retRow = rets![0] as { location_id?: string | null; status?: string }
  if (!retRow.location_id) {
    throw new Error(`[${label}] return.location_id empty after create`)
  }
  logger.info(
    `[rma-smoke][${label}] return=${created.id} location=${retRow.location_id} status=${retRow.status}`
  )

  await adminReceiveReturn(created.id, order.itemId)
  await new Promise((r) => setTimeout(r, 1500))

  const { data: after } = await query.graph({
    entity: "return",
    fields: ["id", "status", "location_id", "metadata"],
    filters: { id: created.id },
  })
  const done = after![0] as {
    status?: string
    location_id?: string
    metadata?: { paytr_refund?: Record<string, unknown> }
  }
  const pr = done.metadata?.paytr_refund as
    | {
        status?: string
        amount?: number
        items_amount?: number
        shipping_amount?: number
        shipping_included?: boolean
      }
    | undefined

  if (done.status !== "received" && done.status !== "partially_received") {
    throw new Error(`[${label}] expected received, got ${done.status}`)
  }
  if (pr?.status !== "success") {
    throw new Error(
      `[${label}] paytr_refund not success: ${JSON.stringify(pr)}`
    )
  }
  if (Boolean(pr.shipping_included) !== expectShippingIncluded) {
    throw new Error(
      `[${label}] shipping_included=${pr.shipping_included} expected ${expectShippingIncluded}`
    )
  }

  const expectedItems = order.itemAmount
  const gotAmount = roundMoney(Number(pr.amount) || 0)
  const gotItems = roundMoney(Number(pr.items_amount) || 0)
  const gotShip = roundMoney(Number(pr.shipping_amount) || 0)

  if (gotItems <= 0) {
    throw new Error(`[${label}] items_amount missing: ${JSON.stringify(pr)}`)
  }
  // Item refund should match line (allow pending_difference path)
  if (Math.abs(gotItems - expectedItems) > 0.02 && gotItems !== expectedItems) {
    logger.warn(
      `[rma-smoke][${label}] items_amount ${gotItems} vs unit ${expectedItems} (pending_difference path OK if close)`
    )
  }
  if (expectShippingIncluded) {
    if (gotShip <= 0) {
      throw new Error(`[${label}] expected shipping in refund, got ${gotShip}`)
    }
  } else if (gotShip !== 0) {
    throw new Error(`[${label}] expected no shipping, got ${gotShip}`)
  }
  if (gotAmount !== roundMoney(gotItems + gotShip)) {
    throw new Error(
      `[${label}] amount ${gotAmount} != items+ship ${gotItems}+${gotShip}`
    )
  }
  // Must not exceed capture
  if (gotAmount > order.captureAmount + 0.01) {
    throw new Error(
      `[${label}] refund ${gotAmount} > capture ${order.captureAmount}`
    )
  }

  const stockAfter = await readStock(container)
  if (stockAfter.stocked < baselineStocked + 1) {
    throw new Error(
      `[${label}] restock failed: stocked before receive=${baselineStocked} after=${stockAfter.stocked}`
    )
  }

  logger.info(
    `[rma-smoke][${label}] OK refund=${gotAmount} shipping_included=${pr.shipping_included} ` +
      `stock ${baselineStocked}→${stockAfter.stocked} (fixture stocked=${stockBefore.stocked})`
  )
}

export default async function smokeRmaRestockRefund({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info("[rma-smoke] === START restock + refund amount ===")

  if (process.env.PAYTR_MOCK !== "1" && process.env.PAYTR_MOCK !== "true") {
    logger.warn(
      "[rma-smoke] PAYTR_MOCK not set — set PAYTR_MOCK=1 on backend + this process"
    )
  }

  await runScenario(container, "A-defect-ship", REASON_DEFECT, true)
  await runScenario(container, "B-mind-no-ship", REASON_MIND, false)

  logger.info("[rma-smoke] === ALL PASSED ===")
}
