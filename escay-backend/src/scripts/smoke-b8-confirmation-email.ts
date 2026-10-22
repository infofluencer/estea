/**
 * B8 smoke: unpaid place → no confirmation; fail → no confirmation;
 * success → one confirmation; duplicate success callback → still one.
 *
 *   npx medusa exec ./src/scripts/smoke-b8-confirmation-email.ts
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
const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const MAILPIT = process.env.MAILPIT_URL || "http://localhost:8025"

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function hash(oid: string, status: string, amt: string) {
  return crypto
    .createHmac("sha256", "")
    .update(oid + "" + status + amt)
    .digest("base64")
}

async function postCallback(oid: string, amt: string, status: "success" | "failed") {
  const body = new URLSearchParams({
    merchant_oid: oid,
    status,
    total_amount: amt,
    hash: hash(oid, status, amt),
  })
  if (status === "failed") {
    body.set("failed_reason_code", "0")
    body.set("failed_reason_msg", "b8_fail")
  }
  const res = await fetch(`${BACKEND}/paytr/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  return { http: res.status, text: await res.text() }
}

async function countConfirmationMails(email: string): Promise<number> {
  const q = encodeURIComponent(email)
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${q}&limit=50`)
  const data = (await res.json()) as {
    messages?: { Subject?: string }[]
  }
  return (data.messages || []).filter((m) =>
    (m.Subject || "").includes("Siparişiniz Alındı")
  ).length
}

async function createUnpaid(
  container: ExecArgs["container"],
  email: string
) {
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
        first_name: "B8",
        last_name: "Test",
        address_1: "T 1",
        city: "İstanbul",
        country_code: "tr",
        postal_code: "34000",
        phone: "+905551112233",
        province: "İstanbul",
        metadata: { district: "Şişli" },
      },
      billing_address: {
        first_name: "B8",
        last_name: "Test",
        address_1: "T 1",
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
  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: (cartPay![0] as any).payment_collection.id,
      provider_id: "pp_paytr_paytr",
    },
  })
  const { result } = await completeCartWorkflow(container).run({
    input: { id: cartId },
  })
  const orderId = (result as { id: string }).id
  const { data: opc } = await query.graph({
    entity: "order_payment_collection",
    fields: ["payment_collection_id"],
    filters: { order_id: orderId },
  })
  const { data: ps } = await query.graph({
    entity: "payment_session",
    fields: ["amount", "data"],
    filters: {
      payment_collection_id: (opc![0] as any).payment_collection_id,
    },
  })
  const session = ps![0] as {
    amount?: number
    data?: { merchant_oid?: string }
  }
  const amount = Number(session.amount)
  return {
    orderId,
    oid: String(session.data?.merchant_oid),
    kurus: String(Math.round(amount * 100)),
  }
}

export default async function smokeB8({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // --- FAIL path ---
  const failEmail = `b8-fail-${Date.now()}@escay.local`
  const failOrder = await createUnpaid(container, failEmail)
  await sleep(2000)
  let n = await countConfirmationMails(failEmail)
  logger.info(`[b8] After place (unpaid) confirm_mails=${n} (expect 0)`)
  if (n !== 0) throw new Error(`FAIL: confirmation on place for ${failEmail}`)

  const failCb = await postCallback(failOrder.oid, failOrder.kurus, "failed")
  logger.info(`[b8] FAIL callback ${failCb.text}`)
  await sleep(2000)
  n = await countConfirmationMails(failEmail)
  const { data: failRows } = await query.graph({
    entity: "order",
    fields: ["status"],
    filters: { id: failOrder.orderId },
  })
  const failStatus = (failRows![0] as { status?: string }).status
  logger.info(
    `[b8] After FAIL status=${failStatus} confirm_mails=${n} (expect canceled + 0)`
  )
  if (failStatus !== "canceled") throw new Error("FAIL order not canceled")
  if (n !== 0) throw new Error("FAIL: confirmation mailed on failed payment")

  // --- SUCCESS path ---
  const okEmail = `b8-ok-${Date.now()}@escay.local`
  const okOrder = await createUnpaid(container, okEmail)
  await sleep(1500)
  n = await countConfirmationMails(okEmail)
  if (n !== 0) throw new Error("FAIL: confirmation on place before capture")

  const okCb = await postCallback(okOrder.oid, okOrder.kurus, "success")
  logger.info(`[b8] SUCCESS callback ${okCb.text}`)
  await sleep(2500)
  n = await countConfirmationMails(okEmail)
  logger.info(`[b8] After SUCCESS confirm_mails=${n} (expect 1)`)
  if (n !== 1) throw new Error(`FAIL: expected 1 confirmation, got ${n}`)

  // Duplicate callback (idempotent)
  const dup = await postCallback(okOrder.oid, okOrder.kurus, "success")
  logger.info(`[b8] DUP SUCCESS callback ${dup.text}`)
  await sleep(2000)
  n = await countConfirmationMails(okEmail)
  logger.info(`[b8] After DUP confirm_mails=${n} (expect 1)`)
  if (n !== 1) throw new Error(`FAIL: duplicate mail after re-callback, got ${n}`)

  // DB notifications
  const notification = container.resolve(Modules.NOTIFICATION) as {
    listNotifications: (
      f?: Record<string, unknown>,
      c?: Record<string, unknown>
    ) => Promise<{ id: string; template?: string; to?: string }[]>
  }
  const notes = await notification.listNotifications(
    { template: "order-confirmation" },
    { take: 50, order: { created_at: "DESC" } }
  )
  const forOk = notes.filter((x) => x.to === okEmail)
  logger.info(
    `[b8] notification rows for success email=${forOk.length} (expect 1)`
  )
  if (forOk.length !== 1) {
    throw new Error(`FAIL: expected 1 notification row, got ${forOk.length}`)
  }

  logger.info("[b8] PASS")
}
