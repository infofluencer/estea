/**
 * Havale / EFT uçtan uca kontrol — sunucuda backend container'ında çalışır.
 *
 *   BACK=$(docker ps -q -f name=escay-backend | head -1)
 *   docker exec -w /app/.medusa/server "$BACK" \
 *     npx medusa exec ./src/scripts/test-bank-transfer.js siz@ornek.com
 *
 * (Derlenmiş .js yalnızca .medusa/server altında; /app/src'de yalnızca .ts var.)
 * Lokal: npm run test:bank-transfer -- siz@ornek.com
 *
 * Ne yapar (varsayılan, canlıda güvenli):
 *  1. Ayar: provider kayıtlı mı, Türkiye bölgesine bağlı mı, IBAN / hesap sahibi
 *     dolu mu, BANK_TRANSFER_ENABLED (checkout'ta görünür mü).
 *  2. Storefront'un yaptığı gibi havale siparişi açar (sepet → havale oturumu →
 *     cart.complete, metadata.payment_method=bank_transfer).
 *  3. Kontrol: sipariş ödeme bekliyor, stok ayrıldı, müşteriye dönen IBAN
 *     bilgisi, "Ödemeniz Bekleniyor" maili kaydı, admin "Havale bekleniyor" olayı.
 *  4. Siparişi iptal eder → stok serbest, iptal siparişe havale onayı reddedilir.
 *
 * Seçenekler (düz kelime ya da --kelime; env: BANK_TEST_EMAIL / BANK_TEST_KEEP=1 / BANK_TEST_CONFIRM=1):
 *  adres@…        IBAN maili bu adrese gider (varsayılan: …@escay.test, mail ulaşmaz)
 *  keep           Siparişi iptal etme — admin'de "Havale alındı" ekranını elle
 *                 görmek için. DİKKAT: o butona basmak canlıda gerçek kargo +
 *                 e-arşiv fatura açar; işiniz bitince siparişi admin'den iptal edin.
 *  confirm        Script "Havale alındı"yı da dener (capture, tekrar tıklama no-op).
 *                 Yalnızca Paraşüt mock/dry-run VE kargo test modundaysa çalışır;
 *                 canlı ayarlarla reddedilir.
 *
 * Yan etkiler (varsayılan): bir sipariş numarası harcanır, admin'de iptal edilmiş
 * "HAVALE TEST" siparişi kalır, adres verildiyse IBAN maili gelir.
 * Kart ödemesi, PayTR, kargo, Paraşüt, Omnisend, Meta etkilenmez (hepsi ödeme
 * onayında çalışır; varsayılan modda onay yok).
 */
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  BANK_TRANSFER_METHOD,
  BANK_TRANSFER_PROVIDER_ID,
  bankTransferInfo,
  pendingBankTransferForOrder,
} from "../lib/bank-transfer"
import {
  confirmBankTransferPayment,
  getBankTransferOrderState,
} from "../lib/bank-transfer-confirm"
import { cancelUnpaidOrderIfSafe } from "../modules/paytr/order-guards"
import {
  isMockMode as isParasutMockMode,
  isParasutDryRun,
  normalizeOptions as normalizeParasutOptions,
} from "../modules/parasut/options"
import { carrierTestMode, isCarrierConfigured } from "../modules/carrier/registry"
import { OPS_EVENT_MODULE } from "../modules/ops-event"
import type OpsEventModuleService from "../modules/ops-event/service"

type Check = { name: string; pass: boolean; detail: string; warnOnly?: boolean }
const checks: Check[] = []

function check(name: string, pass: boolean, detail = "", warnOnly = false) {
  checks.push({ name, pass, detail, warnOnly })
  const mark = pass ? "✓" : warnOnly ? "!" : "✗"
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ""}`)
}

function section(title: string) {
  console.log(`\n${title}`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Subscriber'lar (mail, olay) event bus üzerinden ayrı çalışır — gelene kadar bekle. */
async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 30_000): Promise<T | null> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const v = await fn().catch(() => null)
    if (v) return v
    await sleep(1500)
  }
  return null
}

/**
 * `medusa exec` "--" ile başlayan argümanları kendi seçeneği sanabilir; bu yüzden
 * düz kelimeler de kabul: `siz@ornek.com keep` = `--email=siz@ornek.com --keep`.
 */
function parseArgs(args: string[] | undefined) {
  const list = (args || []).map((a) => String(a).trim())
  const flag = (name: string) =>
    list.includes(name) || list.includes(`--${name}`) || process.env[`BANK_TEST_${name.toUpperCase()}`] === "1"
  const email =
    list.find((a) => a.includes("@"))?.replace(/^--email=/, "") ||
    process.env.BANK_TEST_EMAIL?.trim()
  return {
    email: email || `havale-test-${Date.now()}@escay.test`,
    keep: flag("keep"),
    confirm: flag("confirm"),
  }
}

/** --confirm yalnızca capture'ın gerçek fatura / kargo açmayacağı ortamda. */
function confirmBlockedReason(): string | null {
  const parasut = normalizeParasutOptions({
    clientId: process.env.PARASUT_CLIENT_ID,
    clientSecret: process.env.PARASUT_CLIENT_SECRET,
    username: process.env.PARASUT_USERNAME,
    password: process.env.PARASUT_PASSWORD,
    companyId: process.env.PARASUT_COMPANY_ID,
    dryRun: process.env.PARASUT_DRY_RUN,
  })
  if (!isParasutMockMode(parasut) && !isParasutDryRun(parasut)) {
    return "Paraşüt canlı (PARASUT_DRY_RUN kapalı) — onay gerçek e-arşiv fatura keser"
  }
  if (isCarrierConfigured() && !carrierTestMode()) {
    return "Kargo adaptörü canlı (SHIPPING_CARRIER_TEST_MODE=false) — onay gerçek kargo gönderisi açar"
  }
  return null
}

type InventoryService = {
  listInventoryLevels: (
    f: Record<string, unknown>
  ) => Promise<{ stocked_quantity: number; reserved_quantity: number }[]>
  listReservationItems: (f: Record<string, unknown>) => Promise<{ quantity: number }[]>
}

async function reservedFor(container: MedusaContainer, lineItemId: string): Promise<number> {
  const inventory = container.resolve(Modules.INVENTORY) as unknown as InventoryService
  const rows = await inventory.listReservationItems({ line_item_id: lineItemId })
  return rows.reduce((s, r) => s + Number(r.quantity || 0), 0)
}

async function checkConfig(container: MedusaContainer): Promise<{ regionId: string } | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  section("1) Ayarlar")

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
    filters: { id: BANK_TRANSFER_PROVIDER_ID },
  })
  const provider = providers?.[0] as { is_enabled?: boolean } | undefined
  check(
    `Provider ${BANK_TRANSFER_PROVIDER_ID} kayıtlı ve açık`,
    Boolean(provider?.is_enabled),
    provider ? "" : "kayıt yok — backend bu sürümle en az bir kez açılmalı"
  )

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id"],
  })
  const region = (regions as {
    id: string
    name?: string
    countries?: { iso_2?: string | null }[]
    payment_providers?: { id: string }[]
  }[]).find((r) => (r.countries || []).some((c) => c.iso_2 === "tr"))
  check("Türkiye bölgesi var", Boolean(region), region?.name || "")
  const linked = Boolean(region?.payment_providers?.some((p) => p.id === BANK_TRANSFER_PROVIDER_ID))
  check(
    "Havale Türkiye bölgesine bağlı",
    linked,
    linked ? "" : "çalıştırın: npm run enable:bank-transfer:prod"
  )

  const iban = (process.env.BANK_TRANSFER_IBAN || "").replace(/\s+/g, "").toUpperCase()
  const accountName = (process.env.BANK_TRANSFER_ACCOUNT_NAME || "").trim()
  const bankName = (process.env.BANK_TRANSFER_BANK_NAME || "").trim()
  check(
    "BANK_TRANSFER_IBAN geçerli TR IBAN",
    /^TR\d{24}$/.test(iban),
    iban ? `${iban.slice(0, 4)}…${iban.slice(-4)} (${iban.length} karakter, 26 olmalı)` : "boş"
  )
  check("BANK_TRANSFER_ACCOUNT_NAME dolu", Boolean(accountName), accountName)
  check("BANK_TRANSFER_BANK_NAME dolu", Boolean(bankName), bankName || "boş — faturada 'Banka' yazar", true)

  const visible = Boolean(bankTransferInfo())
  check(
    "Checkout'ta müşteriye görünüyor (BANK_TRANSFER_ENABLED=1)",
    visible,
    visible ? "AÇIK — gerçek müşteriler havale seçebilir" : "kapalı — test için sorun değil",
    true
  )

  const ok = Boolean(provider?.is_enabled && region && linked && /^TR\d{24}$/.test(iban) && accountName)
  return ok && region ? { regionId: region.id } : null
}

async function pickVariant(container: MedusaContainer): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const preferred = process.env.TEST_VARIANT_ID?.trim()
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "manage_inventory", "inventory_items.inventory_item_id", "product.status"],
    pagination: { take: 300 },
  })
  const inventory = container.resolve(Modules.INVENTORY) as unknown as InventoryService
  const rows = (data || []) as {
    id: string
    manage_inventory?: boolean
    inventory_items?: { inventory_item_id?: string }[]
    product?: { status?: string }
  }[]
  rows.sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred))
  for (const v of rows) {
    if (v.product?.status && v.product.status !== "published") continue
    const itemId = v.inventory_items?.[0]?.inventory_item_id
    if (!v.manage_inventory || !itemId) continue
    const levels = await inventory.listInventoryLevels({ inventory_item_id: itemId })
    const available = levels.reduce(
      (s, l) => s + Number(l.stocked_quantity || 0) - Number(l.reserved_quantity || 0),
      0
    )
    if (available >= 2) return v.id
  }
  throw new Error("Stok takipli, en az 2 adet müsait ürün bulunamadı (TEST_VARIANT_ID=… verin).")
}

async function pickShippingOption(container: MedusaContainer): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "rules.attribute", "rules.value"],
  })
  const options = (data || []) as {
    id: string
    rules?: { attribute?: string; value?: unknown }[]
  }[]
  const outbound = options.find(
    (o) => !(o.rules || []).some((r) => r.attribute === "is_return" && String(r.value) === "true")
  )
  if (!outbound) throw new Error("Gönderim (iade olmayan) kargo seçeneği bulunamadı.")
  return outbound.id
}

/** Storefront checkout'unun havale yolu: oturum → metadata → cart.complete. */
async function placeBankTransferOrder(
  container: MedusaContainer,
  regionId: string,
  email: string
): Promise<{ orderId: string; displayId: number | null; lineItemId: string; total: number }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const variantId = await pickVariant(container)

  const { result: cart } = await createCartWorkflow(container).run({
    input: { region_id: regionId, email, currency_code: "try" },
  })
  const cartId = (cart as { id: string }).id
  await addToCartWorkflow(container).run({
    input: { cart_id: cartId, items: [{ variant_id: variantId, quantity: 1 }] },
  })
  const address = {
    first_name: "HAVALE",
    last_name: "TEST",
    address_1: "Test siparişi — gönderilmeyecek",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34380",
    phone: "05000000000",
    province: "İstanbul",
    metadata: { district: "Şişli" },
  }
  await updateCartWorkflow(container).run({
    input: { id: cartId, shipping_address: address, billing_address: address },
  })
  await addShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cartId, options: [{ id: await pickShippingOption(container) }] },
  })

  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
  const { data: cartPay } = await query.graph({
    entity: "cart",
    fields: ["payment_collection.id", "metadata"],
    filters: { id: cartId },
  })
  const pcId = (cartPay![0] as { payment_collection: { id: string } }).payment_collection.id
  await createPaymentSessionsWorkflow(container).run({
    input: { payment_collection_id: pcId, provider_id: BANK_TRANSFER_PROVIDER_ID },
  })
  await updateCartWorkflow(container).run({
    input: {
      id: cartId,
      metadata: {
        legal_accepted_at: new Date().toISOString(),
        payment_method: BANK_TRANSFER_METHOD,
        test: "test-bank-transfer script",
      },
    },
  })

  const { result } = await completeCartWorkflow(container).run({ input: { id: cartId } })
  const orderId = (result as { id: string }).id

  const { data: orders } = await query.graph({
    entity: "order",
    // Toplam: ödeme kaydındaki tutar (müşterinin göndereceği). query.graph'ta
    // order.total kısmi alanlarla yanlış hesaplanabiliyor.
    fields: ["id", "display_id", "items.id", "payment_collections.amount"],
    filters: { id: orderId },
  })
  const order = orders![0] as {
    display_id?: number
    items?: { id: string }[]
    payment_collections?: { amount?: number | string }[]
  }
  return {
    orderId,
    displayId: order.display_id ?? null,
    lineItemId: order.items?.[0]?.id || "",
    total: Number(order.payment_collections?.[0]?.amount ?? 0),
  }
}

async function checkPlacedOrder(
  container: MedusaContainer,
  placed: { orderId: string; lineItemId: string; total: number },
  email: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  section("3) Sipariş sonrası (müşteri + admin)")

  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "metadata", "payment_collections.status"],
    filters: { id: placed.orderId },
  })
  const order = data![0] as {
    status?: string
    metadata?: Record<string, unknown>
    payment_collections?: { status?: string }[]
  }
  check("Sipariş açık (iptal değil)", order.status !== "canceled", `status=${order.status}`)
  check(
    "metadata.payment_method = bank_transfer",
    order.metadata?.payment_method === BANK_TRANSFER_METHOD,
    String(order.metadata?.payment_method)
  )
  const pcStatus = order.payment_collections?.[0]?.status
  check(
    "Ödeme alınmamış görünüyor",
    !["completed", "authorized", "captured"].includes(String(pcStatus)),
    `payment_collection=${pcStatus}`
  )

  const reserved = await reservedFor(container, placed.lineItemId)
  check("Stok ayrıldı", reserved >= 1, `rezerve=${reserved}`)

  const state = await getBankTransferOrderState(container, placed.orderId)
  check("Admin widget durumu: Ödeme bekleniyor", state.state === "pending", `state=${state.state}`)
  check(
    "Admin widget tutarı = müşterinin ödeyeceği tutar",
    state.amount != null && Math.abs(state.amount - placed.total) < 0.01,
    `widget ${state.amount} TL · ödeme kaydı ${placed.total} TL`
  )

  const info = await pendingBankTransferForOrder(container, placed.orderId)
  check(
    "Onay / takip sayfasında IBAN kutusu verisi",
    Boolean(info?.iban && info.account_name),
    info ? `${info.bank_name || "(banka adı yok)"} · ${info.account_name} · ${info.iban}` : "boş"
  )

  const notification = container.resolve(Modules.NOTIFICATION) as {
    listNotifications: (
      f: Record<string, unknown>,
      c?: Record<string, unknown>
    ) => Promise<{ id: string; to?: string; status?: string }[]>
  }
  const mail = await waitFor(async () => {
    const rows = await notification.listNotifications(
      { resource_id: placed.orderId, template: "order-bank-transfer" },
      { take: 5 }
    )
    return rows[0] ?? null
  })
  check(
    "\"Ödemeniz Bekleniyor\" (IBAN) maili oluşturuldu",
    Boolean(mail),
    mail ? `→ ${mail.to}${mail.status ? ` (${mail.status})` : ""}` : "30 sn'de gelmedi — backend sunucusu çalışıyor mu? loglarda [order-placed] arayın"
  )
  if (mail && email.endsWith("@escay.test")) {
    console.log("    (adres @escay.test — mail kutuya ulaşmaz; görmek için kendi adresinizi verin)")
  }

  const ops = container.resolve<OpsEventModuleService>(OPS_EVENT_MODULE)
  const event = await waitFor(async () => {
    const [rows] = await ops.listAndCountOpsEvents(
      { order_id: placed.orderId, kind: "payment.pending" },
      { take: 1 }
    )
    return (rows as { title?: string }[])[0] ?? null
  })
  check(
    "Admin Logs: \"Havale bekleniyor\" olayı",
    Boolean(event),
    event?.title || "30 sn'de gelmedi — backend sunucusu çalışıyor ve bu sürümde mi?"
  )
}

async function checkConfirm(container: MedusaContainer, orderId: string) {
  section("4) Admin \"Havale alındı\"")
  const first = await confirmBankTransferPayment(container, orderId, "test-bank-transfer")
  check("Onay → Ödeme alındı", first.state === "received", `state=${first.state}`)
  const second = await confirmBankTransferPayment(container, orderId, "test-bank-transfer")
  check("İkinci tıklama no-op", second.state === "received" && second.received_at === first.received_at)
  const info = await pendingBankTransferForOrder(container, orderId)
  check("Ödeme sonrası IBAN kutusu kalktı", info === null)
  const notification = container.resolve(Modules.NOTIFICATION) as {
    listNotifications: (f: Record<string, unknown>) => Promise<{ id: string }[]>
  }
  const mail = await waitFor(async () => {
    const rows = await notification.listNotifications({
      resource_id: orderId,
      template: "order-confirmation",
    })
    return rows[0] ?? null
  })
  check("\"Siparişiniz Alındı\" maili oluşturuldu", Boolean(mail))
}

async function cancelAndCheck(
  container: MedusaContainer,
  placed: { orderId: string; lineItemId: string }
) {
  section("4) Temizlik: sipariş iptal")
  const res = await cancelUnpaidOrderIfSafe(container, placed.orderId, "[test-bank-transfer]")
  check("Sipariş iptal edildi", res.canceled, res.skipped || "")
  const reserved = await reservedFor(container, placed.lineItemId)
  check("Stok serbest bırakıldı", reserved === 0, `rezerve=${reserved}`)
  const state = await getBankTransferOrderState(container, placed.orderId)
  check("Admin widget durumu: Sipariş iptal", state.state === "canceled", `state=${state.state}`)
  let refused = false
  try {
    await confirmBankTransferPayment(container, placed.orderId, "test-bank-transfer")
  } catch {
    refused = true
  }
  check("İptal siparişe \"Havale alındı\" reddediliyor", refused)
  const info = await pendingBankTransferForOrder(container, placed.orderId)
  check("İptal siparişte IBAN kutusu yok", info === null)
}

export default async function testBankTransfer({ container, args }: ExecArgs) {
  const opts = parseArgs(args)
  console.log("Havale / EFT testi")
  console.log(`  mail adresi: ${opts.email}`)
  console.log(`  mod: ${opts.confirm ? "onay dahil (confirm)" : opts.keep ? "sipariş açık kalır (keep)" : "aç → kontrol → iptal"}`)

  if (opts.confirm) {
    const blocked = confirmBlockedReason()
    if (blocked) {
      console.error(`\nREDDEDİLDİ confirm: ${blocked}.`)
      console.error("Canlıda onayı gerçek küçük bir siparişle admin'den deneyin (docs/CUTOVER.md §23).")
      process.exitCode = 1
      return
    }
  }

  const config = await checkConfig(container)
  if (!config) {
    console.error("\nAyarlar eksik — sipariş testi yapılmadı.")
    process.exitCode = 1
    return
  }

  section("2) Havale siparişi")
  let placed: Awaited<ReturnType<typeof placeBankTransferOrder>> | null = null
  try {
    placed = await placeBankTransferOrder(container, config.regionId, opts.email)
    check(
      "Sipariş oluştu",
      true,
      `#${placed.displayId ?? "?"} (${placed.orderId}) · ${placed.total.toFixed(2)} TL`
    )
  } catch (err) {
    check("Sipariş oluştu", false, err instanceof Error ? err.message : String(err))
  }

  if (placed) {
    try {
      await checkPlacedOrder(container, placed, opts.email)
      if (opts.confirm) await checkConfirm(container, placed.orderId)
    } catch (err) {
      check("Beklenmeyen hata", false, err instanceof Error ? err.message : String(err))
    } finally {
      if (!opts.keep && !opts.confirm) {
        await cancelAndCheck(container, placed).catch((err) =>
          check("İptal", false, `${err instanceof Error ? err.message : String(err)} — admin'den elle iptal edin`)
        )
      }
    }
  }

  const failed = checks.filter((c) => !c.pass && !c.warnOnly)
  const warned = checks.filter((c) => !c.pass && c.warnOnly)
  console.log(
    `\nSonuç: ${failed.length ? "BAŞARISIZ" : "BAŞARILI"} — ${checks.length - failed.length - warned.length}/${checks.length} geçti, ${failed.length} hata, ${warned.length} uyarı`
  )
  if (placed && (opts.keep || opts.confirm)) {
    console.log(
      `Sipariş #${placed.displayId ?? "?"} açık kaldı → admin: /app/orders/${placed.orderId}` +
        (opts.keep ? "\n  \"Havale alındı\"ya basarsanız gerçek kargo + fatura açılır; bitince siparişi iptal edin." : "")
    )
  }
  if (failed.length) process.exitCode = 1
}
