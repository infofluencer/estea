import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  beginOrderEditOrderWorkflow,
  cancelBeginOrderEditWorkflow,
  confirmOrderEditRequestWorkflow,
  orderEditAddNewItemWorkflow,
  requestOrderEditRequestWorkflow,
} from "@medusajs/medusa/core-flows"

import { autoFulfillPaidOrder } from "./auto-fulfill-order"
import { cancelOpenFulfillmentStrict } from "./reship-fulfillment"
import { resolveDefaultStockLocationId } from "./default-stock-location"
import {
  EXCHANGE_META_KEY,
  exchangeChoices,
  planExchangeShipment,
  readExchange,
  validateExchangeChoices,
  type ExchangeItem,
  type ExchangeMeta,
  type VariantChoice,
} from "./exchange-plan"
import { errorText, recordOpsEvent } from "./ops-events"
import { processReturnRefund } from "./return-refund"
import { isReturnRejected } from "./return-rejection"

/**
 * Medusa siparişlerinde ürün değişimi (aynı ürün, başka beden/renk).
 *
 * Değişim = normal iade + `return.metadata.escay_exchange`:
 *   1. Talep (müşteri formu / admin) ya da var olan iadeyi "Değişime çevir"
 *   2. İade kodu, teslim alma, red — iade akışının aynısı
 *   3. Teslim alınınca (order.return_received) para iadesi YAPILMAZ; yeni varyant
 *      siparişe birim fiyat 0 ile eklenir (order edit → stok rezervasyonu) ve
 *      yalnız bu kalemler için kargo gönderisi açılır. Webhook / yoklama /
 *      kargo mailleri normal gönderiyle aynı yoldan çalışır.
 */

type Dict = Record<string, unknown>

type OrderItemRow = {
  id: string
  title?: string | null
  product_title?: string | null
  product_id?: string | null
  variant_id?: string | null
  variant_title?: string | null
  metadata?: Dict | null
  detail?: Dict | null
}

type ReturnRow = {
  id: string
  status?: string | null
  order_id: string
  metadata?: Dict | null
  items?: { item_id?: string | null; quantity?: unknown; received_quantity?: unknown }[] | null
}

const PRODUCT_VARIANT_FIELDS = [
  "id",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.options.value",
  "variants.options.option.title",
  "variants.inventory_items.required_quantity",
  "variants.inventory_items.inventory.location_levels.location_id",
  "variants.inventory_items.inventory.location_levels.available_quantity",
]

async function loadOrderItems(container: MedusaContainer, orderId: string): Promise<OrderItemRow[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.title",
      "items.product_title",
      "items.product_id",
      "items.variant_id",
      "items.variant_title",
      "items.metadata",
      "items.detail.quantity",
      "items.detail.delivered_quantity",
      "items.detail.return_requested_quantity",
      "items.detail.return_received_quantity",
      "items.detail.return_dismissed_quantity",
    ],
    filters: { id: orderId },
  })
  return ((data?.[0] as { items?: OrderItemRow[] } | undefined)?.items || []) as OrderItemRow[]
}

export type ExchangeOptionsItem = {
  item_id: string
  title: string
  variant: string | null
  choices: VariantChoice[]
}

/** Sipariş kalemleri için seçilebilecek diğer varyantlar (aynı ürün, stok bilgisiyle). */
export async function loadExchangeOptions(
  container: MedusaContainer,
  orderId: string
): Promise<ExchangeOptionsItem[]> {
  const items = (await loadOrderItems(container, orderId)).filter(
    // Önceki değişimde eklenen kalem de yeniden değiştirilebilir; product_id şart.
    (i) => i.product_id && i.variant_id
  )
  const productIds = [...new Set(items.map((i) => i.product_id as string))]
  if (!productIds.length) return []

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: PRODUCT_VARIANT_FIELDS,
    filters: { id: productIds },
  })
  const byProduct = new Map(
    (products as { id: string; variants?: Dict[] }[]).map((p) => [p.id, (p.variants || []) as never[]])
  )
  const locationId = await resolveDefaultStockLocationId(container)

  return items.map((i) => ({
    item_id: i.id,
    title: i.product_title || i.title || "Ürün",
    variant: i.variant_title && !/^default/i.test(i.variant_title) ? i.variant_title : null,
    choices: exchangeChoices(byProduct.get(i.product_id as string) || [], i.variant_id, locationId),
  }))
}

/**
 * Müşteri / admin seçimini değişim kalemlerine çevirir (varyant aynı ürünün
 * başka varyantı, stok yeterli). Adetler çağıran tarafta doğrulanır.
 */
export async function buildExchangeItems(
  container: MedusaContainer,
  orderId: string,
  selections: { item_id: string; quantity: number; variant_id: string }[]
): Promise<ExchangeItem[]> {
  if (!selections.length) throw new Error("Değişim için en az bir ürün seçin.")
  const options = await loadExchangeOptions(container, orderId)
  const byItem = new Map(options.map((o) => [o.item_id, o]))
  validateExchangeChoices(
    selections.map((s) => ({ key: s.item_id, quantity: s.quantity, variant_id: s.variant_id })),
    new Map(options.map((o) => [o.item_id, o.choices]))
  )
  return selections.map((s) => {
    const opt = byItem.get(s.item_id)
    const choice = opt?.choices.find((c) => c.variant_id === s.variant_id)
    return {
      item_id: s.item_id,
      quantity: s.quantity,
      variant_id: s.variant_id,
      title: opt?.title || "Ürün",
      from_variant: opt?.variant || null,
      to_variant: choice?.title || null,
      to_sku: choice?.sku || null,
    }
  })
}

export function newExchangeMeta(
  items: ExchangeItem[],
  source: ExchangeMeta["source"],
  by: string | null
): ExchangeMeta {
  return { status: "requested", items, source, requested_at: new Date().toISOString(), by }
}

async function loadReturn(container: MedusaContainer, returnId: string): Promise<ReturnRow> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "return",
    fields: ["id", "status", "order_id", "metadata", "items.item_id", "items.quantity", "items.received_quantity"],
    filters: { id: returnId },
  })
  const ret = data?.[0] as ReturnRow | undefined
  if (!ret?.id) throw new Error("İade bulunamadı")
  return ret
}

/** Değişim kaydını taze metadata ile birleştirerek yazar. */
async function saveExchange(container: MedusaContainer, returnId: string, patch: Partial<ExchangeMeta>) {
  const ret = await loadReturn(container, returnId)
  const current = readExchange(ret.metadata)
  if (!current && !patch.items) throw new Error("Değişim kaydı yok")
  const next = { ...(current || {}), ...patch } as ExchangeMeta
  await container.resolve(Modules.ORDER).updateReturns([
    { selector: { id: returnId }, data: { metadata: { ...(ret.metadata || {}), [EXCHANGE_META_KEY]: next } } },
  ])
  return next
}

const isReceived = (status?: string | null) => status === "received" || status === "partially_received"

/**
 * Var olan iadeyi değişime çevirir (eski talepler dahil). Para iadesi yapılmışsa,
 * iade reddedildiyse / iptalse ya da yeni ürün zaten gönderildiyse olmaz.
 * İade teslim alınmışsa gönderi hemen açılır.
 */
export async function convertReturnToExchange(
  container: MedusaContainer,
  input: { return_id: string; items: { item_id: string; variant_id: string; quantity?: number }[]; actor: string | null }
): Promise<{ exchange: ExchangeMeta; shipped?: Awaited<ReturnType<typeof shipExchange>> }> {
  const ret = await loadReturn(container, input.return_id)
  if (isReturnRejected(ret.metadata)) throw new Error("Reddedilmiş iade değişime çevrilemez.")
  if (ret.status === "canceled") throw new Error("İptal edilmiş iade değişime çevrilemez.")
  const refund = ret.metadata?.paytr_refund as { status?: string } | null | undefined
  if (refund?.status === "success") throw new Error("Bu iadenin parası iade edildi; değişime çevrilemez.")
  const existing = readExchange(ret.metadata)
  if (existing && existing.status !== "canceled" && existing.new_item_ids?.length) {
    throw new Error("Bu değişimin yeni ürünü siparişe eklendi; değiştirilemez.")
  }

  const requested = new Map<string, number>()
  for (const it of ret.items || []) {
    if (it.item_id) requested.set(it.item_id, (requested.get(it.item_id) || 0) + Number(it.quantity || 0))
  }
  const selections = input.items.map((s) => {
    const max = requested.get(s.item_id) || 0
    if (!max) throw new Error("Seçilen ürün bu iadede yok.")
    const quantity = Math.floor(Number(s.quantity ?? max))
    if (quantity < 1 || quantity > max) throw new Error(`Değişim adedi geçersiz (max ${max}).`)
    return { item_id: s.item_id, variant_id: s.variant_id, quantity }
  })
  const items = await buildExchangeItems(container, ret.order_id, selections)

  const exchange: ExchangeMeta = {
    ...newExchangeMeta(items, existing?.source || "admin", input.actor),
    ...(existing ? { requested_at: existing.requested_at } : {}),
    converted_at: new Date().toISOString(),
  }
  await saveExchange(container, ret.id, exchange)
  await recordOpsEvent(container, {
    kind: "exchange.requested",
    level: "info",
    title: "İade değişime çevrildi",
    detail: describeItems(items),
    orderId: ret.order_id,
    data: { return_id: ret.id, by: input.actor },
  })

  if (isReceived(ret.status)) {
    return { exchange, shipped: await shipExchange(container, { return_id: ret.id, actor: input.actor }) }
  }
  return { exchange }
}

export function describeItems(items: ExchangeItem[]): string {
  return items
    .map((i) => `${i.quantity} × ${i.title}${i.from_variant ? ` ${i.from_variant}` : ""} → ${i.to_variant || "?"}`)
    .join(", ")
}

const shipping = new Set<string>()

/**
 * İade teslim alındıktan sonra yeni ürünü gönderir (idempotent, admin tekrar
 * deneyebilir): 1) order edit ile yeni kalemler (fiyat 0) — bir kez,
 * 2) yalnız bu kalemler için kargo gönderisi.
 */
export async function shipExchange(
  container: MedusaContainer,
  input: { return_id: string; actor: string | null }
): Promise<{ ok: true; fulfillment_id?: string; skipped?: string } | { ok: false; message: string }> {
  if (shipping.has(input.return_id)) return { ok: false, message: "Bu değişim zaten işleniyor." }
  shipping.add(input.return_id)
  try {
    return await shipUnlocked(container, input)
  } finally {
    shipping.delete(input.return_id)
  }
}

async function shipUnlocked(
  container: MedusaContainer,
  input: { return_id: string; actor: string | null }
): Promise<{ ok: true; fulfillment_id?: string; skipped?: string } | { ok: false; message: string }> {
  const ret = await loadReturn(container, input.return_id)
  const exchange = readExchange(ret.metadata)
  if (!exchange || exchange.status === "canceled") return { ok: true, skipped: "no active exchange" }
  if (isReturnRejected(ret.metadata)) return { ok: false, message: "İade reddedildi; değişim gönderilmez." }
  if (!isReceived(ret.status)) return { ok: false, message: "İade henüz teslim alınmadı." }
  if (exchange.status === "shipment_created" && exchange.fulfillment_id) {
    return { ok: true, skipped: "already shipped", fulfillment_id: exchange.fulfillment_id }
  }

  const fail = async (message: string) => {
    await saveExchange(container, ret.id, { status: "failed", error: message, error_at: new Date().toISOString() })
    await recordOpsEvent(container, {
      kind: "exchange.failed",
      level: "error",
      title: "Değişim gönderisi açılamadı",
      detail: message,
      orderId: ret.order_id,
      data: { return_id: ret.id },
    })
    return { ok: false as const, message }
  }

  const plan = planExchangeShipment(exchange, ret.items || [], ret.status)
  if (!plan.length) return fail("Kabul edilen ürün yok — gönderilecek yeni ürün yok.")

  // 1) Yeni kalemler (bir kez). Önceki denemede eklendiyse tekrar eklenmez.
  let newItemIds = exchange.new_item_ids || []
  if (!newItemIds.length) {
    try {
      newItemIds = await addExchangeItems(container, ret, plan, input.actor)
    } catch (error) {
      return fail(`Yeni ürün siparişe eklenemedi: ${errorText(error)}`)
    }
    await saveExchange(container, ret.id, { new_item_ids: newItemIds })
  }

  // 2) Gönderi: yalnız değişim kalemlerinin gönderilmemiş adedi
  const items = (await loadOrderItems(container, ret.order_id)).filter((i) => newItemIds.includes(i.id))
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: fData } = await query.graph({
    entity: "order",
    fields: ["fulfillments.id", "fulfillments.canceled_at", "fulfillments.items.line_item_id", "fulfillments.items.quantity"],
    filters: { id: ret.order_id },
  })
  const fulfillments = ((fData?.[0] as { fulfillments?: Dict[] } | undefined)?.fulfillments || []) as {
    id: string
    canceled_at?: unknown
    items?: { line_item_id?: string | null; quantity?: unknown }[]
  }[]
  const active = fulfillments.filter((f) => !f.canceled_at)
  const fulfilledOf = (id: string) =>
    active.reduce(
      (s, f) => s + (f.items || []).filter((i) => i.line_item_id === id).reduce((n, i) => n + Number(i.quantity || 0), 0),
      0
    )
  const toFulfill = items
    .map((i) => ({ id: i.id, quantity: Math.max(0, Number(i.detail?.quantity || 0) - fulfilledOf(i.id)) }))
    .filter((i) => i.quantity > 0)

  let fulfillmentId: string | undefined
  if (!toFulfill.length) {
    // Önceki denemede gönderi açılmış, kayıt yazılamamış
    fulfillmentId = active.find((f) => (f.items || []).some((i) => i.line_item_id && newItemIds.includes(i.line_item_id)))?.id
  } else {
    const result = await autoFulfillPaidOrder(container, ret.order_id, {
      manual: true,
      items: toFulfill,
      metadata: { escay_exchange_return_id: ret.id },
    }).catch((error) => ({ ok: false as const, message: errorText(error) }))
    if (!result.ok) return fail(result.message)
    if (result.skipped) return fail(`Gönderi açılmadı: ${result.skipped}`)
    fulfillmentId = result.fulfillmentId
  }

  await saveExchange(container, ret.id, {
    status: "shipment_created",
    fulfillment_id: fulfillmentId,
    shipment_at: new Date().toISOString(),
    error: undefined,
    error_at: undefined,
  })
  await recordOpsEvent(container, {
    kind: "exchange.shipped",
    level: "info",
    title: "Değişim gönderisi açıldı",
    detail: describeItems(exchange.items),
    orderId: ret.order_id,
    data: { return_id: ret.id, fulfillment_id: fulfillmentId },
  })
  return { ok: true, fulfillment_id: fulfillmentId }
}

/** Order edit: yeni varyantlar birim fiyat 0 ile (sipariş tutarı değişmez, tahsilat açılmaz). */
async function addExchangeItems(
  container: MedusaContainer,
  ret: ReturnRow,
  plan: { item_id: string; variant_id: string; quantity: number }[],
  actor: string | null
): Promise<string[]> {
  const orderId = ret.order_id
  await beginOrderEditOrderWorkflow(container).run({
    input: {
      order_id: orderId,
      created_by: actor || undefined,
      description: "Ürün değişimi",
      internal_note: `Değişim · iade ${ret.id}`,
    },
  })
  try {
    await orderEditAddNewItemWorkflow(container).run({
      input: {
        order_id: orderId,
        items: plan.map((p) => ({
          variant_id: p.variant_id,
          quantity: p.quantity,
          // 0 ₺: sipariş tutarı değişmez, tahsilat açılmaz (is_custom_price → fiyat listesi okunmaz)
          unit_price: 0,
          is_custom_price: true,
          internal_note: "Değişim",
          metadata: { escay_exchange_return_id: ret.id, escay_exchange_for_item_id: p.item_id },
        })) as never,
      },
    })
    await requestOrderEditRequestWorkflow(container).run({
      input: { order_id: orderId, requested_by: actor || undefined },
    })
    await confirmOrderEditRequestWorkflow(container).run({
      input: { order_id: orderId, confirmed_by: actor || undefined },
    })
  } catch (error) {
    try {
      await cancelBeginOrderEditWorkflow(container).run({ input: { order_id: orderId } })
    } catch (cancelError) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[exchange] order edit iptal edilemedi order=${orderId}: ${errorText(cancelError)}`)
    }
    throw error
  }

  const items = await loadOrderItems(container, orderId)
  const ids = items.filter((i) => i.metadata?.escay_exchange_return_id === ret.id).map((i) => i.id)
  if (!ids.length) throw new Error("Eklenen değişim kalemi bulunamadı")
  return ids
}

/**
 * Değişimi iptal eder (yeni ürün siparişe eklenmeden önce). `refund` ise ve iade
 * teslim alındıysa para iadesi başlatılır; aksi halde iade normal iade olarak sürer.
 */
export async function cancelExchange(
  container: MedusaContainer,
  input: { return_id: string; actor: string | null; refund?: boolean }
): Promise<{ exchange: ExchangeMeta; refund?: Awaited<ReturnType<typeof processReturnRefund>> }> {
  const ret = await loadReturn(container, input.return_id)
  const exchange = readExchange(ret.metadata)
  if (!exchange || exchange.status === "canceled") throw new Error("Aktif değişim yok.")
  if (exchange.new_item_ids?.length) {
    throw new Error("Yeni ürün siparişe eklendi; değişim iptal edilemez. Gönderiyi sipariş sayfasından iptal edin.")
  }
  const next = await saveExchange(container, ret.id, {
    status: "canceled",
    canceled_at: new Date().toISOString(),
    canceled_by: input.actor,
  })
  if (input.refund && isReceived(ret.status)) {
    return { exchange: next, refund: await processReturnRefund(container, { return_id: ret.id, order_id: ret.order_id }) }
  }
  return { exchange: next }
}


/**
 * Değişim gönderisini yeniden açar (kurye almadan; ör. firma gönderiyi iptal etti):
 * firma gönderisi açıkça iptal edilir — reddederse hiçbir şey değişmez —,
 * kargo kaydı iptal edilir, yeni gönderi açılır.
 */
export async function reshipExchange(
  container: MedusaContainer,
  input: { return_id: string; actor: string | null }
): Promise<Awaited<ReturnType<typeof shipExchange>>> {
  const ret = await loadReturn(container, input.return_id)
  const exchange = readExchange(ret.metadata)
  if (!exchange || exchange.status !== "shipment_created" || !exchange.fulfillment_id) {
    throw new Error("Açık değişim gönderisi yok.")
  }
  try {
    await cancelOpenFulfillmentStrict(container, { orderId: ret.order_id, fulfillmentId: exchange.fulfillment_id })
  } catch (error) {
    throw new Error(`${errorText(error)} Değişim değişmedi.`)
  }
  await saveExchange(container, ret.id, {
    status: "requested",
    fulfillment_id: undefined,
    shipment_at: undefined,
    label_printed_at: undefined,
  })
  return shipExchange(container, input)
}

/** Değişim etiketi basıldı (Değişimler sayfası / sipariş sayfası). */
export async function markExchangeLabelPrinted(container: MedusaContainer, returnIds: string[]): Promise<void> {
  const at = new Date().toISOString()
  for (const id of returnIds) {
    try {
      await saveExchange(container, id, { label_printed_at: at })
    } catch (error) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`[exchange] etiket işareti yazılamadı return=${id}: ${errorText(error)}`)
    }
  }
}
