/**
 * Sipariş sözleşmeleri (S3 contracts/<sipariş>/) uçtan uca testi.
 *
 * Önkoşul: lokal backend ayakta (PAYTR_MOCK=1 npm run dev) — order.placed
 * subscriber'ı sunucuda çalışır. S3 env'i gerçek bucket'a bakar; test bitince
 * yüklenen PDF'ler silinir.
 *
 *   npx medusa exec ./src/scripts/test-order-contracts.ts
 *
 * Senaryolar: kart siparişi, havale siparişi (subscriber yoluyla), tutarların
 * siparişle aynı olması, S3 nesnesinin private/şifreli olması, imzalı link,
 * tekrar çalıştırmada dokunmama, eski sipariş (sonradan),
 * S3 hatası → Logs kaydı, S3 env yok, admin route yetkisiz erişim.
 */

import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  addToCartWorkflow,
  completeCartWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  getOrderDetailWorkflow,
  updateCartWorkflow,
} from "@medusajs/medusa/core-flows"

import { BANK_TRANSFER_PROVIDER_ID } from "../lib/bank-transfer"
import {
  contractDataFromOrder,
  generateOrderContracts,
  loadContractOrder,
  ORDER_CONTRACTS,
  orderContractKey,
  signedOrderContractUrl,
  type OrderContractsMeta,
} from "../lib/order-contracts"
import orderPlacedHandler from "../subscribers/order-placed"

const BACKEND = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (ok) console.log(`  ✓ ${label}`)
  else {
    failures++
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}

const s3 = () =>
  new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  })

async function head(key: string) {
  try {
    return await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
  } catch {
    return null
  }
}

async function orderMeta(container: MedusaContainer, id: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ["id", "metadata"], filters: { id } })
  return (data?.[0]?.metadata ?? {}) as Record<string, unknown>
}

export async function placeOrder(
  container: MedusaContainer,
  method: "card" | "bank_transfer",
  acceptedAt: string,
  email = "sozlesme-test@escay.test"
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: regions } = await query.graph({ entity: "region", fields: ["id", "currency_code"] })
  const region = regions![0] as { id: string; currency_code?: string }
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "manage_inventory",
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    pagination: { take: 500 },
  })
  type V = {
    id: string
    inventory_items?: { inventory?: { location_levels?: { stocked_quantity?: number; reserved_quantity?: number }[] } }[]
  }
  const available = (v: V) =>
    (v.inventory_items?.[0]?.inventory?.location_levels ?? []).reduce(
      (n, l) => n + Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0),
      0
    )
  const variant = (variants as V[]).find((v) => v.inventory_items?.length && available(v) >= 5)
  if (!variant) throw new Error("Stoğu ≥5 varyant yok")

  const { result: cart } = await createCartWorkflow(container).run({
    input: { region_id: region.id, email, currency_code: region.currency_code || "try" },
  })
  const cartId = (cart as { id: string }).id
  await addToCartWorkflow(container).run({ input: { cart_id: cartId, items: [{ variant_id: variant.id, quantity: 2 }] } })
  const address = {
    first_name: "Sözleşme",
    last_name: "Testi",
    address_1: "Çiçek Sok. No: 5 D: 3",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34710",
    phone: "+905551112233",
    province: "İstanbul",
    metadata: { district: "Kadıköy" },
  }
  await updateCartWorkflow(container).run({ input: { id: cartId, shipping_address: address, billing_address: address } })
  const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id"] })
  await addShippingMethodToCartWorkflow(container).run({
    input: { cart_id: cartId, options: [{ id: (options![0] as { id: string }).id }] },
  })
  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cartId } })
  const { data: cartPay } = await query.graph({ entity: "cart", fields: ["payment_collection.id"], filters: { id: cartId } })
  const pcId = (cartPay![0] as { payment_collection: { id: string } }).payment_collection.id
  await createPaymentSessionsWorkflow(container).run({
    input: { payment_collection_id: pcId, provider_id: method === "card" ? "pp_paytr_paytr" : BANK_TRANSFER_PROVIDER_ID },
  })
  await updateCartWorkflow(container).run({
    input: { id: cartId, metadata: { legal_accepted_at: acceptedAt, payment_method: method, test: "test-order-contracts" } },
  })
  const { result } = await completeCartWorkflow(container).run({ input: { id: cartId } })
  return (result as { id: string }).id
}

/** order.placed subscriber'ı sunucuda çalışır → metadata.contracts gelene dek bekle. */
async function waitForContracts(container: MedusaContainer, id: string, ms = 30_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const meta = (await orderMeta(container, id)).contracts as OrderContractsMeta | undefined
    if (meta?.source === "medusa") return meta
    await sleep(1000)
  }
  return null
}

/** Siparişi order.placed yaymadan oluşturur (hata senaryoları için). */
async function rawOrder(container: MedusaContainer, metadata: Record<string, unknown>) {
  const orderModule = container.resolve(Modules.ORDER) as {
    createOrders: (d: Record<string, unknown>) => Promise<{ id: string }>
  }
  const order = await orderModule.createOrders({
    currency_code: "try",
    email: "sozlesme-test@escay.test",
    metadata,
    shipping_address: { first_name: "Ham", last_name: "Sipariş", address_1: "Test Sok. 1", city: "İstanbul", country_code: "tr" },
    items: [{ title: "Test Şal", quantity: 1, unit_price: 100 }],
  })
  return order.id
}

async function verifyStored(container: MedusaContainer, orderId: string, label: string, acceptedAt: string) {
  const meta = await waitForContracts(container, orderId)
  check(Boolean(meta), `${label}: order.placed sonrası metadata.contracts yazıldı`)
  if (!meta) return
  check(meta.source === "medusa", `${label}: source = medusa`)
  check(meta.backfilled === false, `${label}: "sipariş anında" (backfilled=false)`, meta.backfilled)
  check(meta.legal_accepted_at === new Date(acceptedAt).toISOString(), `${label}: müşteri onay zamanı taşındı`, meta.legal_accepted_at)
  for (const c of ORDER_CONTRACTS) {
    const key = orderContractKey(orderId, c.kind)
    check(meta.keys[c.kind] === key, `${label}: ${c.kind} anahtarı contracts/ altında`)
    const h = await head(key)
    check(Boolean(h), `${label}: ${c.kind} S3'te var`)
    check(h?.ContentType === "application/pdf", `${label}: ${c.kind} ContentType pdf`, h?.ContentType)
    check(h?.ServerSideEncryption === "AES256", `${label}: ${c.kind} şifreli (AES256)`, h?.ServerSideEncryption)
    check(h?.Metadata?.source === "medusa", `${label}: ${c.kind} S3 metadata source=medusa`, h?.Metadata)
    const signed = await fetch(await signedOrderContractUrl(key))
    const body = Buffer.from(await signed.arrayBuffer())
    check(signed.ok && body.subarray(0, 5).toString() === "%PDF-", `${label}: ${c.kind} imzalı link PDF döndürüyor`, signed.status)
    const publicUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`
    const pub = await fetch(publicUrl)
    check(pub.status === 403, `${label}: ${c.kind} herkese açık değil (403)`, pub.status)
  }

  // PDF'e basılan tutarlar = siparişin gerçek tutarları
  const pdfData = contractDataFromOrder((await loadContractOrder(container, orderId))!, null)
  const { result: full } = await getOrderDetailWorkflow(container).run({
    input: { order_id: orderId, fields: ["id", "total", "item_total", "shipping_total", "items.total"], filters: { is_draft_order: false } },
  })
  const fmt = (v: unknown) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(Number(v))
  check(pdfData.totals.find((t) => t.label === "Toplam (KDV dahil)")?.value === fmt(full.total), `${label}: PDF toplamı = sipariş toplamı`, [
    pdfData.totals,
    fmt(full.total),
  ])
  check(pdfData.totals.find((t) => t.label === "Ara Toplam")?.value === fmt(full.item_total), `${label}: PDF ara toplam = sipariş`, fmt(full.item_total))
  check(pdfData.items[0]?.total === fmt(full.items?.[0]?.total), `${label}: satır tutarı = sipariş`, [pdfData.items[0]?.total, fmt(full.items?.[0]?.total)])
  check(pdfData.recipient.name === "Sözleşme Testi" && pdfData.recipient.email === "sozlesme-test@escay.test", `${label}: alıcı bilgileri dolu`)
}

export default async function testOrderContracts({ container }: ExecArgs) {
  const created: string[] = []
  let backfilledOrder: string | null = null
  const health = await fetch(`${BACKEND}/health`).catch(() => null)
  if (!health?.ok) throw new Error(`Backend ${BACKEND} ayakta değil — önce: PAYTR_MOCK=1 npm run dev`)
  if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET yok")

  try {
    console.log("\n1) Kart siparişi (PayTR, ödemeden önce order.placed)")
    const accepted1 = new Date(Date.now() - 5000).toISOString()
    const card = await placeOrder(container, "card", accepted1)
    created.push(card)
    await verifyStored(container, card, "kart", accepted1)

    console.log("\n2) Havale siparişi")
    const accepted2 = new Date().toISOString()
    const bank = await placeOrder(container, "bank_transfer", accepted2)
    created.push(bank)
    await verifyStored(container, bank, "havale", accepted2)
    const bankData = contractDataFromOrder((await loadContractOrder(container, bank))!, null)
    check(bankData.paymentMethod === "bank_transfer", "havale: ödeme şekli havale olarak basılıyor")

    console.log("\n3) Tekrar çalıştırma (çift olay / admin butonu) sözleşmeye dokunmaz")
    const before = await head(orderContractKey(card, "mesafeli-satis-sozlesmesi"))
    const again = await generateOrderContracts(container, card)
    const after = await head(orderContractKey(card, "mesafeli-satis-sozlesmesi"))
    check(again.ok && again.skipped === "zaten var", "ikinci çağrı atlandı", again)
    check(before?.LastModified?.getTime() === after?.LastModified?.getTime(), "S3 dosyası değişmedi")

    console.log("\n5) Eski sipariş (admin 'Sözleşmeleri oluştur') → 'sonradan' işaretli")
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: olds } = await query.graph({
      entity: "order",
      fields: ["id", "created_at", "metadata"],
      filters: { created_at: { $lt: new Date(Date.now() - 2 * 3600_000).toISOString() } },
      pagination: { take: 50, order: { created_at: "DESC" } },
    })
    const old = (olds as { id: string; metadata?: Record<string, unknown> | null }[]).find(
      (o) => !o.metadata?.contracts
    )
    if (old) {
      const r = await generateOrderContracts(container, old.id)
      created.push(old.id)
      backfilledOrder = old.id
      check(r.ok && r.meta?.backfilled === true, "eski sipariş backfilled=true", r)
    } else {
      check(true, "eski sipariş yok (lokal DB) — atlandı")
    }

    console.log("\n6) S3 hatası → sipariş etkilenmez, Logs'a 'Sözleşme PDF'i oluşturulamadı' düşer")
    const broken = await rawOrder(container, { payment_method: "card" })
    created.push(broken)
    const realBucket = process.env.S3_BUCKET
    process.env.S3_BUCKET = "escay-olmayan-bucket-sozlesme-testi"
    try {
      await orderPlacedHandler({ event: { name: "order.placed", data: { id: broken } }, container } as never)
    } finally {
      process.env.S3_BUCKET = realBucket
    }
    check(!(await orderMeta(container, broken)).contracts, "hatada metadata.contracts yazılmadı")
    const { data: evs } = await query.graph({
      entity: "ops_event",
      fields: ["id", "kind", "level", "order_id"],
      filters: { order_id: broken, kind: "contract.failed" },
    })
    check((evs?.length ?? 0) === 1 && (evs![0] as { level?: string }).level === "error", "Logs'a hata kaydı düştü", evs)
    const retry = await generateOrderContracts(container, broken)
    check(retry.ok && !retry.skipped, "S3 düzelince admin butonu sözleşmeyi üretir", retry)

    console.log("\n7) S3 env yok")
    delete process.env.S3_BUCKET
    try {
      const r = await generateOrderContracts(container, broken)
      check(!r.ok && r.error === "S3 yapılandırılmamış", "S3_BUCKET boşsa açık hata", r)
    } finally {
      process.env.S3_BUCKET = realBucket
    }

    console.log("\n8) Admin route yetkisiz erişim")
    const unauth = await fetch(`${BACKEND}/admin/orders/${card}/contracts/mesafeli-satis-sozlesmesi`, { redirect: "manual" })
    check(unauth.status === 401, "oturumsuz istek reddedilir (401)", unauth.status)
    const unauthPost = await fetch(`${BACKEND}/admin/orders/${card}/contracts`, { method: "POST", redirect: "manual" })
    check(unauthPost.status === 401, "oturumsuz üretme isteği reddedilir (401)", unauthPost.status)
  } finally {
    console.log("\nTemizlik: test PDF'leri S3'ten siliniyor")
    for (const id of created) {
      for (const c of ORDER_CONTRACTS) {
        await s3()
          .send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: orderContractKey(id, c.kind) }))
          .catch(() => undefined)
      }
    }
    // Eski sipariş testi gerçek lokal siparişe yazdı → yalnız contracts anahtarı silinir ("" = sil)
    if (backfilledOrder) {
      await (container.resolve(Modules.ORDER) as {
        updateOrders: (id: string, d: Record<string, unknown>) => Promise<unknown>
      })
        .updateOrders(backfilledOrder, { metadata: { contracts: "" } })
        .catch(() => undefined)
    }
    for (const id of created) {
      const left = await head(orderContractKey(id, "mesafeli-satis-sozlesmesi"))
      if (left) {
        failures++
        console.log(`  ✗ silinemedi: ${id}`)
      }
    }
    console.log(`  ${created.length} siparişin PDF'leri silindi`)
  }

  console.log(failures ? `\n✗ ${failures} kontrol başarısız` : "\n✓ Tüm sözleşme senaryoları geçti")
  if (failures) process.exitCode = 1
}
