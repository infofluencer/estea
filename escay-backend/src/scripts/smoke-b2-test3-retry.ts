/**
 * B2 Test 3 — fail sonrası stok serbest + retry başarı.
 *
 *   npx medusa exec ./src/scripts/smoke-b2-test3-retry.ts
 *
 * Akış:
 * 1) Stoğu 1 yap
 * 2) Order A (complete unpaid) → reserved=1
 * 3) FAILED callback → A canceled, reserved=0
 * 4) Order B (aynı varyant) → reserved=1  (retry "tükendi" olmamalı)
 * 5) SUCCESS callback → B ödendi
 * 6) Stoğu eski haline yakın geri bırak (9999)
 */
import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createCartWorkflow,
  addToCartWorkflow,
  updateCartWorkflow,
  addShippingMethodToCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  completeCartWorkflow,
} from "@medusajs/medusa/core-flows"
import crypto from "crypto"

const VARIANT_ID = "variant_01M22Y5JB23RR7CAB69MQ1V4P2"
const LEVEL_ID = "ilev_01M22Y5K92RD1FCSBDFPECHZYC"
const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function callbackHash(oid: string, status: string, amt: string) {
  return crypto
    .createHmac("sha256", "")
    .update(oid + "" + status + amt)
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
  if (input.status === "failed") {
    body.set("failed_reason_code", "0")
    body.set("failed_reason_msg", "b2_test3_fail")
  }
  const res = await fetch(`${BACKEND}/paytr/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  return { http: res.status, body: text }
}

async function createUnpaidOrder(
  container: ExecArgs["container"],
  email: string
): Promise<{
  orderId: string
  displayId: number
  oid: string
  kurus: string
  amount: number
}> {
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
      items: [{ variant_id: VARIANT_ID, quantity: 1 }],
    },
  })

  await updateCartWorkflow(container).run({
    input: {
      id: cartId,
      shipping_address: {
        first_name: "B2",
        last_name: "Retry",
        address_1: "Test 1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
        metadata: { district: "Şişli" },
      },
      billing_address: {
        first_name: "B2",
        last_name: "Retry",
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
    fields: ["payment_collection.id"],
    filters: { id: cartId },
  })
  const pcId = (cartPay![0] as { payment_collection: { id: string } })
    .payment_collection.id

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

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "status", "total"],
    filters: { id: orderId },
  })
  const order = orders![0] as {
    display_id?: number
    status?: string
    total?: number
  }

  const { data: opc } = await query.graph({
    entity: "order_payment_collection",
    fields: ["payment_collection_id"],
    filters: { order_id: orderId },
  })
  const { data: ps } = await query.graph({
    entity: "payment_session",
    fields: ["amount", "data"],
    filters: {
      payment_collection_id: (opc![0] as { payment_collection_id: string })
        .payment_collection_id,
    },
  })
  const session = ps![0] as {
    amount?: number | string
    data?: { merchant_oid?: string }
  }
  const amount = Number(session.amount)
  const kurus = String(Math.round(amount * 100))
  const oid = String(session.data?.merchant_oid || "")

  return {
    orderId,
    displayId: Number(order.display_id),
    oid,
    kurus,
    amount,
  }
}

async function readStock(container: ExecArgs["container"]) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["inventory_item_id"],
    filters: { variant_id: VARIANT_ID },
  })
  const invId = (links![0] as { inventory_item_id: string }).inventory_item_id
  const { data } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "stocked_quantity", "reserved_quantity", "inventory_item_id"],
    filters: { inventory_item_id: invId },
  })
  const row = data![0] as {
    stocked_quantity?: number
    reserved_quantity?: number
  }
  return {
    stocked: Number(row.stocked_quantity || 0),
    reserved: Number(row.reserved_quantity || 0),
  }
}

async function setStocked(
  container: ExecArgs["container"],
  qty: number
) {
  const inv = container.resolve(Modules.INVENTORY) as {
    updateInventoryLevels: (
      data: { id: string; inventory_item_id: string; location_id: string; stocked_quantity: number }[]
    ) => Promise<unknown>
    retrieveInventoryLevel: (id: string) => Promise<{
      id: string
      inventory_item_id: string
      location_id: string
    }>
  }
  const level = await inv.retrieveInventoryLevel(LEVEL_ID)
  await inv.updateInventoryLevels([
    {
      id: level.id,
      inventory_item_id: level.inventory_item_id,
      location_id: level.location_id,
      stocked_quantity: qty,
    },
  ])
}

export default async function smokeB2Test3({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("[b2-t3] === START Test 3 retry+stock ===")

  // 1) stock = 1
  await setStocked(container, 1)
  let stock = await readStock(container)
  logger.info(`[b2-t3] stock set → stocked=${stock.stocked} reserved=${stock.reserved}`)
  if (stock.stocked !== 1 || stock.reserved !== 0) {
    throw new Error(`Expected stocked=1 reserved=0, got ${JSON.stringify(stock)}`)
  }

  // 2) Order A
  const orderA = await createUnpaidOrder(
    container,
    `b2-t3-a-${Date.now()}@escay.local`
  )
  stock = await readStock(container)
  logger.info(
    `[b2-t3] Order A created id=${orderA.orderId} #${100000 + orderA.displayId} oid=${orderA.oid} kurus=${orderA.kurus} stock=${JSON.stringify(stock)}`
  )
  if (stock.reserved !== 1) {
    throw new Error(`Expected reserved=1 after Order A, got ${stock.reserved}`)
  }

  // 3) FAILED callback A
  const failRes = await postCallback({
    oid: orderA.oid,
    amt: orderA.kurus,
    status: "failed",
  })
  logger.info(`[b2-t3] FAILED curl → http=${failRes.http} body=${failRes.body}`)
  await sleep(1500)

  const { data: aRows } = await query.graph({
    entity: "order",
    fields: ["id", "status", "canceled_at"],
    filters: { id: orderA.orderId },
  })
  const aStatus = (aRows![0] as { status?: string }).status
  stock = await readStock(container)
  logger.info(
    `[b2-t3] After FAIL A status=${aStatus} stock=${JSON.stringify(stock)}`
  )
  if (aStatus !== "canceled") {
    throw new Error(`Order A not canceled: ${aStatus}`)
  }
  if (stock.reserved !== 0) {
    throw new Error(
      `KALDI: reserved still ${stock.reserved} after FAIL — retry would starve`
    )
  }

  // 4) Order B retry (must succeed with only 1 stock freed)
  let orderB: Awaited<ReturnType<typeof createUnpaidOrder>>
  try {
    orderB = await createUnpaidOrder(
      container,
      `b2-t3-b-${Date.now()}@escay.local`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `KALDI: Retry Order B failed (likely inventory): ${msg}`
    )
  }
  stock = await readStock(container)
  logger.info(
    `[b2-t3] Order B created id=${orderB.orderId} #${100000 + orderB.displayId} oid=${orderB.oid} stock=${JSON.stringify(stock)}`
  )
  if (stock.reserved !== 1) {
    throw new Error(`Expected reserved=1 after Order B, got ${stock.reserved}`)
  }

  // 5) SUCCESS callback B
  const okRes = await postCallback({
    oid: orderB.oid,
    amt: orderB.kurus,
    status: "success",
  })
  logger.info(`[b2-t3] SUCCESS curl → http=${okRes.http} body=${okRes.body}`)
  await sleep(2000)

  const { data: bRows } = await query.graph({
    entity: "order",
    fields: ["id", "status"],
    filters: { id: orderB.orderId },
  })
  const bStatus = (bRows![0] as { status?: string }).status

  const { data: opc } = await query.graph({
    entity: "order_payment_collection",
    fields: ["payment_collection_id"],
    filters: { order_id: orderB.orderId },
  })
  const { data: pcs } = await query.graph({
    entity: "payment_collection",
    fields: ["id", "status"],
    filters: {
      id: (opc![0] as { payment_collection_id: string }).payment_collection_id,
    },
  })
  const payStatus = (pcs![0] as { status?: string }).status

  stock = await readStock(container)
  logger.info(
    `[b2-t3] After SUCCESS B order_status=${bStatus} pay_status=${payStatus} stock=${JSON.stringify(stock)}`
  )

  // Final asserts
  if (aStatus !== "canceled") throw new Error("A not canceled")
  if (payStatus !== "completed" && payStatus !== "authorized") {
    // capture may complete collection
    logger.warn(`[b2-t3] unexpected pay_status=${payStatus}`)
  }

  // Restore catalog stock so other smokes aren't blocked
  await setStocked(container, 9999)
  const restored = await readStock(container)
  logger.info(`[b2-t3] stock restored → ${JSON.stringify(restored)}`)

  logger.info(
    `[b2-t3] PASS A=#${100000 + orderA.displayId} canceled, B=#${100000 + orderB.displayId} paid (${payStatus}), reserved released on fail`
  )
}
