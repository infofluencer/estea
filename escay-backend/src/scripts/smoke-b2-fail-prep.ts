import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createCartWorkflow, addToCartWorkflow, updateCartWorkflow,
  addShippingMethodToCartWorkflow, createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow, completeCartWorkflow,
} from "@medusajs/medusa/core-flows"

const VARIANT_ID = "variant_01M22Y5JB23RR7CAB69MQ1V4P2"

export default async function prep({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const email = `b2-fail-${Date.now()}@escay.local`

  const { data: levels } = await query.graph({
    entity: "inventory_level",
    fields: ["id", "stocked_quantity", "reserved_quantity", "inventory_item_id"],
  })
  // resolve inventory item for variant
  const { data: links } = await query.graph({
    entity: "product_variant_inventory_item",
    fields: ["variant_id", "inventory_item_id"],
    filters: { variant_id: VARIANT_ID },
  })
  const invId = (links?.[0] as { inventory_item_id: string })?.inventory_item_id
  const before = (levels as any[])?.find((l) => l.inventory_item_id === invId)
  logger.info(`[b2] BEFORE reserved=${before?.reserved_quantity} stocked=${before?.stocked_quantity} inv=${invId}`)

  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code"] })
  const region = regions![0] as { id: string; currency_code?: string }

  const { result: cart } = await createCartWorkflow(container).run({
    input: { region_id: region.id, email, currency_code: region.currency_code || "try" },
  })
  const cartId = (cart as { id: string }).id
  await addToCartWorkflow(container).run({
    input: { cart_id: cartId, items: [{ variant_id: VARIANT_ID, quantity: 1 }] },
  })
  await updateCartWorkflow(container).run({
    input: {
      id: cartId,
      shipping_address: {
        first_name: "B2", last_name: "Fail", address_1: "Test 1", city: "İstanbul",
        country_code: "tr", postal_code: "34000", phone: "+905551112233", province: "İstanbul",
        metadata: { district: "Şişli" },
      },
      billing_address: {
        first_name: "B2", last_name: "Fail", address_1: "Test 1", city: "İstanbul",
        country_code: "tr", postal_code: "34000", phone: "+905551112233", province: "İstanbul",
      },
    },
  })
  const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id"] })
  await addShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cartId, options: [{ id: (options![0] as { id: string }).id }] },
  })
  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
  const { data: cartPay } = await query.graph({
    entity: "cart", fields: ["payment_collection.id"], filters: { id: cartId },
  })
  const pcId = (cartPay![0] as any).payment_collection.id
  await createPaymentSessionsWorkflow(container).run({
    input: { payment_collection_id: pcId, provider_id: "pp_paytr_paytr" },
  })
  const { result: completed } = await completeCartWorkflow(container).run({ input: { id: cartId } })
  const orderId = (completed as { id: string }).id

  const { data: opc } = await query.graph({
    entity: "order_payment_collection", fields: ["payment_collection_id"], filters: { order_id: orderId },
  })
  const { data: ps } = await query.graph({
    entity: "payment_session",
    fields: ["id", "amount", "data", "payment_collection_id"],
    filters: { payment_collection_id: (opc![0] as any).payment_collection_id },
  })
  const session = ps![0] as { amount?: number | string; data?: { merchant_oid?: string } }
  const { data: orders } = await query.graph({
    entity: "order", fields: ["id", "display_id", "status", "total", "email"], filters: { id: orderId },
  })
  const order = orders![0] as any

  // reserved after
  const { data: levels2 } = await query.graph({
    entity: "inventory_level",
    fields: ["stocked_quantity", "reserved_quantity", "inventory_item_id"],
    filters: { inventory_item_id: invId },
  })
  const after = levels2?.[0] as any

  const amountMajor = Number(session.amount)
  // Medusa may store major units; PayTR wants kuruş string
  const kurus = String(Math.round(amountMajor * 100))

  logger.info(
    `[b2] READY order=${orderId} display=${order.display_id} status=${order.status} email=${email} ` +
    `oid=${session.data?.merchant_oid} amount=${session.amount} kurus=${kurus} ` +
    `reserved_after=${after?.reserved_quantity} stocked=${after?.stocked_quantity}`
  )
}
