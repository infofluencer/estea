#!/usr/bin/env node
/**
 * Omnisend uçtan uca duman testi (staging).
 *
 * 1. Store API ile sepet + stoktaki bir ürün
 * 2. Checkout bilgisi: e-posta + marketing_consent=true + adres
 *    → backend omnisend-started-checkout subscriber → Omnisend contact + "started checkout"
 * 3. Omnisend API'den kişinin oluştuğunu / abone olduğunu doğrular
 * 4. Sepet geri yükleme linkini (abandonedCheckoutURL) kontrol eder
 *
 * Gerçek Omnisend hesabına yazar (sandbox yok): yalnızca OMNISEND_TEST_EMAIL adresi.
 * Staging backend'de OMNISEND_TEST_EMAILS bu adresi içermeli, PAYTR_OID_PREFIX=STG olmalı.
 * Abandoned Checkout otomasyonu ~1 saat sonra bu adrese gerçek mail atar (beklenen).
 *
 * Ayarlar (apps/backend/.env.cutover veya ortam):
 *   OMNISEND_SMOKE_BACKEND_URL=http://187.127.86.214:9001   (staging backend)
 *   OMNISEND_SMOKE_STOREFRONT_URL=http://187.127.86.214:3016
 *   OMNISEND_SMOKE_PUBLISHABLE_KEY=pk_...                    (staging)
 *   OMNISEND_TEST_EMAIL=senin@adresin.com
 *   OMNISEND_API_KEY=...                                     (doğrulama için; yoksa 3. adım atlanır)
 *
 * Çalıştır (lokal):            npm run test:staging:omnisend
 * Çalıştır (staging container): node src/scripts/omnisend-smoke.mjs pk_...
 *   → backend localhost:9000, e-posta OMNISEND_TEST_EMAILS'in ilki, key container env'inden
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const envFile = join(here, "..", "..", ".env.cutover")
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

// Staging backend container'ı içinde çalışınca: localhost:9000 + container env'i
const BACKEND = (process.env.OMNISEND_SMOKE_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
const STOREFRONT = (process.env.OMNISEND_SMOKE_STOREFRONT_URL || "http://187.127.86.214:3016").replace(/\/$/, "")
const PK = process.env.OMNISEND_SMOKE_PUBLISHABLE_KEY || process.argv[2] || ""
const EMAIL = (
  process.env.OMNISEND_TEST_EMAIL ||
  (process.env.OMNISEND_TEST_EMAILS || "").split(",")[0] ||
  ""
)
  .trim()
  .toLowerCase()
const OMNISEND_KEY = process.env.OMNISEND_API_KEY || ""

const missing = Object.entries({
  OMNISEND_SMOKE_BACKEND_URL: BACKEND,
  OMNISEND_SMOKE_STOREFRONT_URL: STOREFRONT,
  OMNISEND_SMOKE_PUBLISHABLE_KEY: PK,
  OMNISEND_TEST_EMAIL: EMAIL,
})
  .filter(([, v]) => !v)
  .map(([k]) => k)
if (missing.length) {
  console.error(`✗ Eksik ayar: ${missing.join(", ")} (apps/backend/.env.cutover)`)
  process.exit(1)
}
// Prod: domain veya prod storefront portu (187.127.86.214:3015)
if (/esteacay\.com/.test(STOREFRONT + BACKEND) || /187\.127\.86\.214:3015\b/.test(STOREFRONT)) {
  console.error("✗ REFUSE: bu test staging içindir, prod adresleri kullanılamaz.")
  process.exit(1)
}

const ok = (msg) => console.log(`✓ ${msg}`)
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function store(path, init = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PK,
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

async function omnisendContact(email) {
  const res = await fetch(
    `https://api.omnisend.com/v5/contacts?email=${encodeURIComponent(email)}`,
    { headers: { "X-API-KEY": OMNISEND_KEY } }
  )
  if (!res.ok) throw new Error(`Omnisend contacts → ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  return (body.contacts || [])[0] || null
}

async function main() {
  console.log(`Backend: ${BACKEND}\nStorefront: ${STOREFRONT}\nTest e-posta: ${EMAIL}\n`)

  // 1. Sepet + stoktaki ürün
  const { regions } = await store("/store/regions?limit=5")
  const region = regions.find((r) => r.currency_code === "try") || regions[0]
  if (!region) fail("Region bulunamadı")
  const { products } = await store(
    `/store/products?limit=50&region_id=${region.id}&fields=handle,title,*variants,+variants.inventory_quantity`
  )
  const variant = products
    .flatMap((p) => (p.variants || []).map((v) => ({ ...v, handle: p.handle })))
    .find((v) => v.inventory_quantity == null || v.inventory_quantity > 0)
  if (!variant) fail("Stokta varyant yok")

  const { cart } = await store("/store/carts", {
    method: "POST",
    body: JSON.stringify({ region_id: region.id }),
  })
  await store(`/store/carts/${cart.id}/line-items`, {
    method: "POST",
    body: JSON.stringify({ variant_id: variant.id, quantity: 1 }),
  })
  ok(`Sepet ${cart.id} — ${variant.handle} / ${variant.title}`)

  // 2. Checkout bilgisi (storefront saveCheckoutContactAction ile aynı alanlar)
  const address = {
    first_name: "Omnisend",
    last_name: "Test",
    address_1: "Test Sokak No:1",
    city: "İstanbul",
    postal_code: "34000",
    country_code: "tr",
    phone: "5550000000",
  }
  await store(`/store/carts/${cart.id}`, {
    method: "POST",
    body: JSON.stringify({
      email: EMAIL,
      shipping_address: address,
      billing_address: address,
      metadata: { marketing_consent: true, omnisend_smoke: true },
    }),
  })
  ok("Checkout bilgisi kaydedildi (pazarlama izni: evet) → backend 'started checkout' göndermeli")

  // 3. Omnisend doğrulama
  if (!OMNISEND_KEY) {
    console.log("… OMNISEND_API_KEY yok — Omnisend doğrulaması atlandı (panelden Audience'a bakın)")
  } else {
    let contact = null
    for (let i = 0; i < 12 && !contact; i++) {
      await sleep(5000)
      contact = await omnisendContact(EMAIL).catch(() => null)
    }
    if (!contact) {
      fail(
        "Omnisend'de kişi 60 sn içinde görünmedi. Staging backend log'unda [omnisend] satırlarına bakın: " +
          "OMNISEND_API_KEY, PAYTR_OID_PREFIX=STG ve OMNISEND_TEST_EMAILS ayarlı mı?"
      )
    }
    const emailId = (contact.identifiers || []).find((i) => i.type === "email")
    const status = emailId?.channels?.email?.status
    ok(`Omnisend kişi: ${contact.contactID} — e-posta durumu: ${status || "?"}`)
    if (status !== "subscribed") {
      console.log("  ! 'subscribed' bekleniyordu (daha önce abonelikten çıkmış olabilir)")
    }
  }

  // 4. Sepet geri yükleme linki
  const recover = `${STOREFRONT}/sepet/recover/${cart.id}`
  const res = await fetch(recover, { redirect: "manual" })
  const location = res.headers.get("location") || ""
  if (res.status !== 307 || !location.endsWith("/odeme")) {
    fail(`Geri yükleme linki beklenmedik: ${res.status} → ${location}`)
  }
  ok(`Geri yükleme linki → ${location} (sepet cookie'si: ${res.headers.get("set-cookie") ? "var" : "yok"})`)

  console.log(`
Sonraki adımlar (elle):
  • Omnisend → Audience → ${EMAIL} → Activity: "Started checkout" görünmeli
  • ~1 saat sonra Abandoned Checkout maili gelecek; içindeki link sepeti açmalı:
    ${recover}
  • "placed order" testi: staging admin → Orders → bu sepetin siparişi yok (ödeme yapılmadı).
    Tam akış için staging'de checkout'u bitirip admin'den ödemeyi Capture edin.`)
}

main().catch((err) => fail(err.message))
