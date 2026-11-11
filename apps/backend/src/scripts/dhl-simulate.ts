/**
 * DHL sandbox simülasyonu — admin panelde her kargo durumunu sahte siparişlerle gösterir.
 *
 * Gerçek akış kullanılır: sepet → sipariş → ödeme (sistem ödemesi) → otomatik kargo kaydı
 * (DHL SANDBOX'ta gerçek sipariş + barkod + etiket) → durum yoklaması → mailler → iade.
 * Sandbox'ta gönderi fiziksel olarak ilerlemediği için "transferde / dağıtımda / teslim edildi"
 * gibi durumlar kayda `dhl_sim` olarak yazılır; adaptör bunu yalnız sandbox'ta okur
 * (adapters/dhl/index.ts → simulatedStatusResponse) ve yoklama gerçek yanıtmış gibi işler.
 *
 * Koşullar (yoksa çalışmaz): SHIPPING_CARRIER=dhl, SHIPPING_CARRIER_TEST_MODE=true,
 * DHL_ENV≠prod, kargo seçeneği carrier_carrier (SHIPPING_CARRIER=dhl iken npm run setup:turkey) ve
 * canlı dışı ortam işareti (PAYTR_OID_PREFIX dolu) ya da DHL_SIM_FORCE=1.
 *
 * Sunucuda (derlenmiş): npm run dhl:simulate:prod -- <komut>
 *
 *   npm run dhl:simulate                    → bütün senaryoları kur
 *   npm run dhl:simulate -- only teslim,iade → yalnız seçilenler (anahtarlar: list)
 *   npm run dhl:simulate -- list            → simülasyon siparişleri ve durumları
 *   npm run dhl:simulate -- set 1234 4      → #1234'ün kargo durumunu 4 yap (1–8) ve işle
 *   npm run dhl:simulate -- clean           → DHL sandbox kayıtlarını ve siparişleri iptal et
 *
 * Env: SIM_EMAIL (mailler buraya gider; varsayılan operasyon adresi).
 *      SIM_SELF_FULFILL=1 → backend'in olay dinleyicisini bekleme, kargo kayıtlarını script açsın
 *      (backend SHIPPING_CARRIER=dhl ile ÇALIŞMIYORSA; çalışıyorsa kullanmayın, çift kayıt riski).
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  cancelOrderWorkflow,
  capturePaymentWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows"
import "../modules/carrier/adapters"
import { createStoreReturnRequest } from "../api/store/returns/_create-return"
import { COMPANY } from "../emails/company"
import { autoFulfillPaidOrder } from "../lib/auto-fulfill-order"
import { patchFulfillmentData } from "../lib/carrier-actions"
import { errorText } from "../lib/ops-events"
import { cancelOpenFulfillmentStrict } from "../lib/reship-fulfillment"
import { acceptReturnItems } from "../lib/return-acceptance"
import { rejectStoreReturn } from "../lib/return-rejection"
import { trackFulfillment, type TrackRow } from "../lib/shipping/track-shipments"
import { DHL_SIM_KEY, readDhlOptions, type DhlSimulatedStatus } from "../modules/carrier/adapters/dhl"
import { carrierTestMode, configuredCarrierCode, getConfiguredCarrier } from "../modules/carrier/registry"
import { CARRIER_PROVIDER_ID } from "../modules/carrier/types"

const SIM_METADATA_KEY = "escay_simulation"
const SYSTEM_PAYMENT_PROVIDER = "pp_system_default"

type Address = { first: string; last: string; phone: string; address1: string; city: string; district: string; postal: string; neighbourhood?: string }

type After = "none" | "cancel_shipment" | "reship" | "cancel_order" | "return_requested" | "return_rejected" | "return_received"

type Scenario = {
  key: string
  title: string
  address: Address
  /** Sırayla işlenen DHL durum kodları (boş = sandbox'ın gerçek durumu: 1 Hazırlandı). */
  codes: string[]
  after: After
  /** Kaç kalem / adet. */
  quantity?: number
}

const A = (first: string, last: string, phone: string, city: string, district: string, address1: string, postal: string, neighbourhood?: string): Address => ({
  first,
  last,
  phone,
  address1,
  city,
  district,
  postal,
  neighbourhood,
})

const SCENARIOS: Scenario[] = [
  { key: "etiket", title: "Etiket oluşturuldu (kargoya verilmedi)", address: A("Ayşe", "Yılmaz", "+905321112201", "İstanbul", "Kadıköy", "Caferağa Mah. Moda Cad. No: 12 D: 4", "34710", "Caferağa"), codes: [], after: "none" },
  { key: "transfer", title: "Kargoda (transfer aşamasında)", address: A("Mehmet", "Demir", "+905321112202", "Ankara", "Çankaya", "Kızılay Mah. Atatürk Blv. No: 85 D: 7", "06420", "Kızılay"), codes: ["2"], after: "none" },
  { key: "sube", title: "Teslimat şubesinde", address: A("Fatma", "Kaya", "+905321112203", "İzmir", "Bornova", "Kazımdirik Mah. 364. Sok. No: 9 D: 2", "35100", "Kazımdirik"), codes: ["2", "3"], after: "none" },
  { key: "dagitim", title: "Dağıtımda (adrese yönlendirildi)", address: A("Ali", "Çelik", "+905321112204", "Bursa", "Nilüfer", "Görükle Mah. Uludağ Cad. No: 41 D: 5", "16285", "Görükle"), codes: ["2", "3", "4"], after: "none", quantity: 2 },
  { key: "teslim", title: "Teslim edildi", address: A("Zeynep", "Şahin", "+905321112205", "Antalya", "Muratpaşa", "Fener Mah. Tekelioğlu Cad. No: 18 D: 3", "07160", "Fener"), codes: ["2", "4", "5"], after: "none" },
  { key: "teslim-edilemedi", title: "Teslim edilemedi (alıcı adreste yok)", address: A("Mustafa", "Aydın", "+905321112206", "Konya", "Selçuklu", "Bosna Hersek Mah. Osmanlı Cad. No: 22", "42250", "Bosna Hersek"), codes: ["2", "4", "6"], after: "none" },
  { key: "geri-geliyor", title: "Göndericiye geri geliyor", address: A("Elif", "Öztürk", "+905321112207", "Adana", "Seyhan", "Reşatbey Mah. Atatürk Cad. No: 30 D: 6", "01120", "Reşatbey"), codes: ["2", "6", "7"], after: "none" },
  { key: "destek", title: "DHL destek istiyor", address: A("Hasan", "Arslan", "+905321112208", "Gaziantep", "Şahinbey", "İncilipınar Mah. Prof. Muammer Aksoy Blv. No: 14", "27090", "İncilipınar"), codes: ["2", "8"], after: "none" },
  { key: "gonderi-iptal", title: "Gönderi iptal edildi (sipariş bekliyor)", address: A("Emine", "Doğan", "+905321112209", "Samsun", "Atakum", "Mimarsinan Mah. Atatürk Blv. No: 210 D: 9", "55200", "Mimarsinan"), codes: [], after: "cancel_shipment" },
  { key: "yeniden-gonderim", title: "İptal edilip yeniden açılan gönderi", address: A("İbrahim", "Kılıç", "+905321112210", "Kayseri", "Melikgazi", "Alpaslan Mah. Bağdat Cad. No: 7 D: 11", "38030", "Alpaslan"), codes: [], after: "reship" },
  { key: "siparis-iptal", title: "Sipariş iptal edildi (kargoya verilmeden)", address: A("Hatice", "Aslan", "+905321112211", "Eskişehir", "Tepebaşı", "Hoşnudiye Mah. İsmet İnönü Cad. No: 55 D: 2", "26130", "Hoşnudiye"), codes: [], after: "cancel_order" },
  { key: "kargo-acilamadi", title: "Ödendi, kargo kaydı açılamadı (adreste telefon yok)", address: A("Osman", "Polat", "+905321112212", "Trabzon", "Ortahisar", "Kemerkaya Mah. Kahramanmaraş Cad. No: 3", "61030", "Kemerkaya"), codes: [], after: "none" },
  { key: "iade", title: "Teslim edildi → iade talebi (kodlu iade)", address: A("Merve", "Koç", "+905321112213", "Trabzon", "Hayrat", "Balaban Mah. Uğurlu Cad. No: 11", "61950", "Balaban"), codes: ["2", "4", "5"], after: "return_requested" },
  { key: "iade-red", title: "Teslim edildi → iade talebi reddedildi", address: A("Hüseyin", "Kurt", "+905321112214", "Mersin", "Yenişehir", "Gazi Mah. Gazi Mustafa Kemal Blv. No: 320 D: 8", "33110", "Gazi"), codes: ["2", "4", "5"], after: "return_rejected" },
  { key: "iade-teslim", title: "Teslim edildi → iade geldi, teslim alındı", address: A("Sultan", "Özdemir", "+905321112215", "Diyarbakır", "Kayapınar", "Peyas Mah. Urfa Blv. No: 44 D: 10", "21070", "Peyas"), codes: ["2", "4", "5"], after: "return_received" },
]

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }
type Query = { graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }> }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type FulRow = TrackRow & { provider_id?: string | null }
type OrderRow = {
  id: string
  display_id?: number | null
  status?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
  items?: { id: string; quantity?: number }[] | null
  shipping_address?: { id: string } | null
  fulfillments?: FulRow[] | null
  payment_collections?: { id: string; status?: string | null; payments?: { id: string; captured_at?: string | null }[] | null }[] | null
  returns?: { id: string; status?: string | null; metadata?: Record<string, unknown> | null }[] | null
}

async function loadOrder(query: Query, orderId: string): Promise<OrderRow> {
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "email",
      "metadata",
      "items.id",
      "items.quantity",
      "shipping_address.id",
      "fulfillments.id",
      "fulfillments.created_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
      "fulfillments.data",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
      "returns.id",
      "returns.status",
      "returns.metadata",
    ],
    filters: { id: orderId },
  })
  const order = data?.[0] as OrderRow | undefined
  if (!order) throw new Error(`Sipariş bulunamadı: ${orderId}`)
  return order
}

const activeFulfillment = (o: OrderRow) => (o.fulfillments || []).filter((f) => !f.canceled_at).slice(-1)[0]

async function loadSimOrders(query: Query): Promise<OrderRow[]> {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const out: OrderRow[] = []
  for (let page = 0; page < 50; page++) {
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "display_id", "status", "metadata"],
      filters: { created_at: { $gte: since } },
      pagination: { take: 200, skip: page * 200, order: { created_at: "ASC" } },
    })
    const rows = (data as OrderRow[]) || []
    out.push(...rows.filter((o) => o.metadata?.[SIM_METADATA_KEY]))
    if (rows.length < 200) break
  }
  return out
}

function assertSafe(logger: Logger) {
  const o = readDhlOptions()
  const problems: string[] = []
  if (configuredCarrierCode() !== "dhl" || !getConfiguredCarrier()) problems.push("SHIPPING_CARRIER=dhl olmalı")
  if (o.env !== "sandbox") problems.push("DHL_ENV=prod — simülasyon yalnız sandbox'ta çalışır")
  if (!carrierTestMode()) problems.push("SHIPPING_CARRIER_TEST_MODE=true olmalı")
  const nonProd = Boolean((process.env.PAYTR_OID_PREFIX || "").trim())
  if (!nonProd && process.env.DHL_SIM_FORCE !== "1") {
    problems.push("canlı dışı ortam işareti yok (PAYTR_OID_PREFIX boş). Bu veritabanı canlı değilse DHL_SIM_FORCE=1 ile çalıştırın")
  }
  if (problems.length) throw new Error(`Simülasyon çalıştırılamaz:\n - ${problems.join("\n - ")}`)
  if (!nonProd) logger.warn("[sim] DHL_SIM_FORCE=1 — PAYTR_OID_PREFIX boş; fatura (BizimHesap) ve pazarlama entegrasyonlarının kapalı/mock olduğundan emin olun.")
}

async function setup(container: MedusaContainer, query: Query) {
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code", "payment_providers.id"], filters: { currency_code: "try" } })
  const region = regions?.[0] as { id: string; payment_providers?: { id: string }[] } | undefined
  if (!region) throw new Error("TRY bölgesi yok (seed çalıştırın).")
  if (!(region.payment_providers || []).some((p) => p.id === SYSTEM_PAYMENT_PROVIDER)) {
    throw new Error(`Bölgede ${SYSTEM_PAYMENT_PROVIDER} ödeme sağlayıcısı yok — simülasyon siparişleri ödenemez.`)
  }
  const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
  const salesChannelId = (channels?.[0] as { id: string } | undefined)?.id
  if (!salesChannelId) throw new Error("Satış kanalı yok.")
  const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id", "name", "provider_id", "type.code"] })
  const option = (options as { id: string; name?: string; provider_id?: string; type?: { code?: string } }[]).find((o) => o.type?.code === "standard_tr") ?? (options?.[0] as { id: string; provider_id?: string })
  if (!option) throw new Error("Kargo seçeneği yok (seed çalıştırın).")
  if (option.provider_id !== CARRIER_PROVIDER_ID) {
    throw new Error(`Kargo seçeneği "${option.provider_id}" sağlayıcısına bağlı. Önce: SHIPPING_CARRIER=dhl iken npm run setup:turkey (sunucuda setup:turkey:prod) → ${CARRIER_PROVIDER_ID}.`)
  }
  const { data: variants } = await query.graph({
    entity: "variant",
    fields: ["id", "title", "sku", "product.title", "product.status", "inventory_items.inventory.location_levels.stocked_quantity", "inventory_items.inventory.location_levels.reserved_quantity"],
    pagination: { take: 200 },
  })
  type V = { id: string; title?: string; product?: { title?: string; status?: string }; inventory_items?: { inventory?: { location_levels?: { stocked_quantity?: number; reserved_quantity?: number }[] } }[] }
  const stocked = (variants as V[]).filter((v) => {
    if (v.product?.status !== "published") return false
    const levels = (v.inventory_items || []).flatMap((i) => i.inventory?.location_levels || [])
    return levels.some((l) => Number(l.stocked_quantity) - Number(l.reserved_quantity) >= 20)
  })
  if (!stocked.length) throw new Error("Stokta (≥20) yayınlanmış ürün varyantı yok.")
  const { data: reasons } = await query.graph({ entity: "return_reason", fields: ["id", "value"] })
  const reasonId = ((reasons as { id: string; value?: string }[]).find((r) => r.value === "changed_mind") ?? (reasons?.[0] as { id: string } | undefined))?.id
  return { regionId: region.id, salesChannelId, shippingOptionId: option.id, variants: stocked, reasonId }
}

async function seed(container: MedusaContainer, logger: Logger, only: string[]) {
  assertSafe(logger)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as Query
  const orderModule = container.resolve(Modules.ORDER) as { updateOrders: (id: string, data: Record<string, unknown>) => Promise<unknown> }
  const ctx = await setup(container, query)
  const email = (process.env.SIM_EMAIL || COMPANY.emailOps).trim()
  const scenarios = only.length ? SCENARIOS.filter((s) => only.includes(s.key)) : SCENARIOS
  if (!scenarios.length) throw new Error(`Senaryo bulunamadı. Anahtarlar: ${SCENARIOS.map((s) => s.key).join(", ")}`)
  logger.info(`[sim] ${scenarios.length} senaryo, mailler → ${email}`)

  /** Olayları işleyen bir süreç (çalışan backend) var mı? İlk siparişte öğrenilir. */
  let subscriberAlive: boolean | null = process.env.SIM_SELF_FULFILL === "1" ? false : null
  const results: { key: string; title: string; order: string; note: string; ok: boolean }[] = []

  const waitFor = async <T>(what: () => Promise<T | null | undefined | false>, timeoutMs: number, stepMs = 3000): Promise<T | null> => {
    const end = Date.now() + timeoutMs
    for (;;) {
      const v = await what()
      if (v) return v
      if (Date.now() >= end) return null
      await sleep(stepMs)
    }
  }

  for (const [index, s] of scenarios.entries()) {
    let label = "?"
    try {
      // 1) Sepet → sipariş (gerçek checkout iş akışları; stok ayrılır, sipariş mailleri gider)
      const variant = ctx.variants[index % ctx.variants.length]
      const a = s.address
      const address = {
        first_name: a.first,
        last_name: a.last,
        phone: a.phone,
        address_1: a.address1,
        // Mağaza sözleşmesi: city = il, province = ilçe (ayrıca metadata.district).
        city: a.city,
        province: a.district,
        postal_code: a.postal,
        country_code: "tr",
        metadata: { district: a.district, ...(a.neighbourhood ? { neighbourhood: a.neighbourhood } : {}) },
      }
      const { result: cart } = await createCartWorkflow(container).run({
        input: {
          region_id: ctx.regionId,
          sales_channel_id: ctx.salesChannelId,
          email,
          currency_code: "try",
          items: [{ variant_id: variant.id, quantity: s.quantity ?? 1 }],
          shipping_address: address,
          billing_address: address,
          metadata: { [SIM_METADATA_KEY]: s.key },
        },
      })
      const cartId = (cart as { id: string }).id
      await addShippingMethodToCartWorkflow(container).run({ input: { cart_id: cartId, options: [{ id: ctx.shippingOptionId }] } })
      await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
      const { data: carts } = await query.graph({ entity: "cart", fields: ["payment_collection.id"], filters: { id: cartId } })
      const pcId = (carts?.[0] as { payment_collection?: { id: string } }).payment_collection?.id
      if (!pcId) throw new Error("Ödeme koleksiyonu oluşmadı.")
      await createPaymentSessionsWorkflow(container).run({ input: { payment_collection_id: pcId, provider_id: SYSTEM_PAYMENT_PROVIDER } })
      const { result: completed } = await completeCartWorkflow(container).run({ input: { id: cartId } })
      const orderId = (completed as { id: string }).id
      let order = await loadOrder(query, orderId)
      label = `#${order.display_id}`
      await orderModule.updateOrders(orderId, {
        metadata: { ...(order.metadata || {}), [SIM_METADATA_KEY]: s.key, simulation_title: s.title },
      })

      // Checkout telefonsuz adresi kabul etmez; "kargo açılamadı" için sipariş sonrası bozulur
      // (eski/elle düzenlenmiş sipariş durumu).
      if (s.key === "kargo-acilamadi" && order.shipping_address?.id) {
        await (container.resolve(Modules.ORDER) as unknown as { updateOrderAddresses: (rows: Record<string, unknown>[]) => Promise<unknown> }).updateOrderAddresses([
          { id: order.shipping_address.id, phone: "" },
        ])
      }

      // 2) Ödeme → payment.captured (otomatik kargo kaydı, ödeme maili)
      const paymentId = order.payment_collections?.flatMap((p) => p.payments || [])[0]?.id
      if (!paymentId) throw new Error("Ödeme kaydı yok (sistem ödemesi yetkilendirilmedi).")
      await capturePaymentWorkflow(container).run({ input: { payment_id: paymentId } })

      // 3) Kargo kaydı: önce olay dinleyicisini bekle; kimse işlemiyorsa kendimiz açarız.
      const expectFailure = s.key === "kargo-acilamadi"
      let ful: FulRow | undefined
      if (subscriberAlive !== false) {
        const found = await waitFor(async () => activeFulfillment(await loadOrder(query, orderId)), expectFailure ? 20_000 : 180_000)
        if (found) subscriberAlive = true
        else if (subscriberAlive === null && !expectFailure) {
          subscriberAlive = false
          logger.warn("[sim] Olayları işleyen süreç yok gibi (backend çalışmıyor?) — kargo kayıtlarını script açacak.")
        }
        ful = found ?? undefined
      }
      if (!ful) {
        const res = await autoFulfillPaidOrder(container, orderId, { manual: true }).catch((e) => ({ ok: false as const, message: errorText(e) }))
        if (!res.ok && !expectFailure) throw new Error(`Kargo kaydı açılamadı: ${res.message}`)
        ful = activeFulfillment(await loadOrder(query, orderId))
        if (expectFailure) {
          results.push({ key: s.key, title: s.title, order: label, ok: !ful, note: ful ? "beklenmedik şekilde açıldı" : `kargo açılamadı (beklenen): ${res.ok ? "-" : res.message.slice(0, 140)}` })
          logger.info(`[sim] ${label} ${s.key}: kargo kaydı yok (beklenen)`)
          continue
        }
      }
      if (!ful) throw new Error("Kargo kaydı bulunamadı.")
      const d = (ful.data || {}) as Record<string, unknown>
      const notes: string[] = [d.dhl_barcode_pending ? "etiket bekliyor" : `DHL gönderi ${String(d.tracking_number ?? "-")}`]

      // 4) Durum ilerletme — gerçek yoklama kodu (trackFulfillment) işler
      for (const code of s.codes) {
        const sim: DhlSimulatedStatus = { code, at: new Date().toISOString() }
        if (code === "5") sim.deliveredTo = `${a.first} ${a.last}`.toLocaleUpperCase("tr-TR")
        if (code === "7") sim.returnShipmentId = `9${String(d.tracking_number ?? "0").slice(1)}`
        await patchFulfillmentData(container, ful.id, { [DHL_SIM_KEY]: sim })
        order = await loadOrder(query, orderId)
        ful = (order.fulfillments || []).find((f) => f.id === ful!.id)!
        await trackFulfillment(container, ful)
      }
      if (s.codes.length) notes.push(`durum ${s.codes.join("→")}`)

      // 5) Sonrası: iptal / yeniden gönderim / iade
      order = await loadOrder(query, orderId)
      if (s.after === "cancel_shipment" || s.after === "reship" || s.after === "cancel_order") {
        const c = await cancelOpenFulfillmentStrict(container, { orderId, fulfillmentId: ful.id })
        notes.push(`gönderi iptal (DHL: ${c.carrierCancel})`)
        if (s.after === "reship") {
          const r = await autoFulfillPaidOrder(container, orderId, { manual: true })
          if (!r.ok) throw new Error(`Yeniden gönderim açılamadı: ${r.message}`)
          const nf = activeFulfillment(await loadOrder(query, orderId))
          notes.push(`yeni gönderi ref ${String(nf?.data?.shipment_ref ?? "-")}`)
        }
        if (s.after === "cancel_order") {
          await cancelOrderWorkflow(container).run({ input: { order_id: orderId, no_notification: true } })
          notes.push("sipariş iptal")
        }
      }
      if (s.after.startsWith("return_")) {
        if (!ctx.reasonId) throw new Error("İade sebebi yok (seed çalıştırın).")
        const item = order.items?.[0]
        if (!item) throw new Error("Sipariş kalemi yok.")
        const ret = await createStoreReturnRequest(container, {
          order_id: orderId,
          items: [{ id: item.id, quantity: 1 }],
          reason_id: ctx.reasonId,
          note: "Simülasyon iade talebi",
          source: "admin",
          created_by: "simulation",
        })
        // İade kodu (DHL createReturnOrder) order.return_requested dinleyicisinde üretilir.
        const code = subscriberAlive
          ? await waitFor(async () => {
              const r = (await loadOrder(query, orderId)).returns?.find((x) => x.id === ret.id)
              return (r?.metadata?.return_code as string | undefined) || null
            }, 120_000)
          : null
        notes.push(code ? `iade kodu ${code}` : "iade talebi açıldı (kod: backend çalışırken üretilir)")
        if (s.after === "return_rejected") {
          await rejectStoreReturn(container, { return_id: ret.id, reason: "Simülasyon: ürün kullanılmış", rejected_by: "simulation" })
          notes.push("iade reddedildi")
        }
        if (s.after === "return_received") {
          await acceptReturnItems(container, { return_id: ret.id, items: [{ item_id: item.id, restock_quantity: 1 }], reason: "Simülasyon: ürün sağlam geldi", actor_id: "simulation" })
          notes.push("iade teslim alındı (para iadesi sistem ödemesinde elle kalır)")
        }
      }

      results.push({ key: s.key, title: s.title, order: label, ok: true, note: notes.join(" · ") })
      logger.info(`[sim] ✓ ${label} ${s.key}: ${notes.join(" · ")}`)
    } catch (error) {
      results.push({ key: s.key, title: s.title, order: label, ok: false, note: errorText(error).slice(0, 400) })
      logger.error(`[sim] ✗ ${label} ${s.key}: ${errorText(error)}`)
    }
  }

  logger.info("[sim] ── ÖZET ──")
  for (const r of results) logger.info(`[sim] ${r.ok ? "✓" : "✗"} ${r.order.padEnd(7)} ${r.title} — ${r.note}`)
  const failed = results.filter((r) => !r.ok).length
  logger.info(`[sim] ${results.length - failed}/${results.length} senaryo kuruldu. Admin → Siparişler / İadeler / Logs.`)
  if (failed) throw new Error(`${failed} senaryo kurulamadı (yukarıdaki log).`)
}

async function list(container: MedusaContainer, logger: Logger) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as Query
  const orders = await loadSimOrders(query)
  if (!orders.length) return logger.info("[sim] Simülasyon siparişi yok.")
  for (const row of orders) {
    const o = await loadOrder(query, row.id)
    const f = activeFulfillment(o)
    const d = (f?.data || {}) as Record<string, unknown>
    logger.info(
      `[sim] #${o.display_id} ${String(o.metadata?.[SIM_METADATA_KEY]).padEnd(18)} sipariş=${o.status} kargo=${f ? `${String(d.status_code ?? "1")} ${String(d.status ?? "")} (${String(d.tracking_number ?? "etiket yok")})` : "yok"} iade=${(o.returns || []).map((r) => r.status).join(",") || "-"}`
    )
  }
  logger.info(`[sim] Senaryo anahtarları: ${SCENARIOS.map((s) => s.key).join(", ")}`)
}

async function setStatus(container: MedusaContainer, logger: Logger, displayId: string, code: string) {
  assertSafe(logger)
  if (!/^[1-8]$/.test(code)) throw new Error("Durum kodu 1–8: 1 hazırlandı, 2 transfer, 3 şubede, 4 dağıtımda, 5 teslim, 6 teslim edilemedi, 7 geri geliyor, 8 destek")
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as Query
  const { data } = await query.graph({ entity: "order", fields: ["id"], filters: { display_id: Number(displayId) } })
  const id = (data?.[0] as { id: string } | undefined)?.id
  if (!id) throw new Error(`#${displayId} bulunamadı.`)
  let order = await loadOrder(query, id)
  if (!order.metadata?.[SIM_METADATA_KEY]) throw new Error(`#${displayId} simülasyon siparişi değil — dokunulmadı.`)
  let ful = activeFulfillment(order)
  if (!ful) throw new Error(`#${displayId} için aktif kargo kaydı yok.`)
  const sim: DhlSimulatedStatus = { code, at: new Date().toISOString() }
  await patchFulfillmentData(container, ful.id, { [DHL_SIM_KEY]: sim })
  order = await loadOrder(query, id)
  ful = (order.fulfillments || []).find((f) => f.id === ful!.id)!
  await trackFulfillment(container, ful)
  const after = activeFulfillment(await loadOrder(query, id))
  logger.info(`[sim] #${displayId} → ${String(after?.data?.status_code)} ${String(after?.data?.status)} (kargoya verildi: ${after?.shipped_at ? "evet" : "hayır"}, teslim: ${after?.delivered_at ? "evet" : "hayır"})`)
}

async function clean(container: MedusaContainer, logger: Logger) {
  assertSafe(logger)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as unknown as Query
  const adapter = getConfiguredCarrier()!
  const orders = await loadSimOrders(query)
  let dhl = 0
  let canceled = 0
  for (const row of orders) {
    const o = await loadOrder(query, row.id)
    for (const f of o.fulfillments || []) {
      const d = (f.data || {}) as Record<string, unknown>
      // DHL sandbox kaydı: Medusa'da kargoya verilmiş görünse de sandbox'ta hâlâ iptal edilebilir.
      if (d.dhl_reference_id && !f.canceled_at) {
        const r = await adapter.cancelShipment(d)
        if (r.dhl_canceled) dhl++
      }
      if (!f.canceled_at && !f.shipped_at && !f.delivered_at) {
        await cancelOpenFulfillmentStrict(container, { orderId: o.id, fulfillmentId: f.id }).catch((e) => logger.warn(`[sim] #${o.display_id} gönderi iptal edilemedi: ${errorText(e)}`))
      }
    }
    if (o.status !== "canceled") {
      try {
        await cancelOrderWorkflow(container).run({ input: { order_id: o.id, no_notification: true } })
        canceled++
      } catch (e) {
        logger.warn(`[sim] #${o.display_id} iptal edilemedi (kargoya verilmiş/teslim edilmiş sipariş Medusa'da iptal edilemez): ${errorText(e).slice(0, 160)}`)
      }
    }
  }
  logger.info(`[sim] temizlik: ${orders.length} simülasyon siparişi, ${dhl} DHL sandbox kaydı iptal, ${canceled} sipariş iptal. Kargoya verilmiş siparişler kayıtta kalır.`)
}

export default async function dhlSimulate({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as unknown as Logger
  const [command = "seed", ...rest] = args || []
  if (command === "list") return list(container, logger)
  if (command === "set") return setStatus(container, logger, String(rest[0] ?? ""), String(rest[1] ?? ""))
  if (command === "clean") return clean(container, logger)
  if (command === "seed" || command === "only") {
    const only = command === "only" ? String(rest[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean) : []
    return seed(container, logger, only)
  }
  throw new Error(`Bilinmeyen komut "${command}". Kullanım: seed | only <anahtarlar> | list | set <sipariş no> <1-8> | clean`)
}
