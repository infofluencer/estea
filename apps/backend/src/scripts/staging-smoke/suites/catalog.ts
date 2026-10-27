import { assert, assertStatus, section, skip } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import { asNumber, asRecord, bodyMessage, storeFetch } from "../_helpers/http"

export type CatalogContext = {
  productId: string
  handle: string
  variantId: string
  unitPrice: number
  inventoryQuantity: number | null
  regionId: string
}

export async function runCatalogSuite(
  env: StagingEnv
): Promise<CatalogContext | null> {
  section("2. Katalog")

  // calculated_price için region zorunlu — env yoksa store API'den al
  const regions = await storeFetch(env, `/store/regions?limit=10`)
  assertStatus("GET /store/regions", regions.status, 200)
  const regionList =
    (asRecord(regions.body).regions as Record<string, unknown>[]) || []
  const turkey =
    regionList.find(
      (r) =>
        String(r.name || "").toLowerCase().includes("türkiye") ||
        String(r.name || "").toLowerCase().includes("turkey") ||
        String(r.currency_code || "").toLowerCase() === "try"
    ) || regionList[0]
  const regionId = env.regionId || String(turkey?.id || "")
  assert(
    "Region id çözüldü",
    Boolean(regionId),
    regionId || bodyMessage(regions.body)
  )
  if (!regionId) return null

  const listQs = new URLSearchParams({
    limit: "100",
    region_id: regionId,
    country_code: "tr",
    fields:
      "id,title,handle,status,*variants,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory",
  })

  const list = await storeFetch(env, `/store/products?${listQs}`)
  assertStatus(
    "GET /store/products",
    list.status,
    200
  )
  if (list.status !== 200) {
    assert(
      "GET /store/products hata gövdesi",
      false,
      bodyMessage(list.body)
    )
  }

  const body = asRecord(list.body)
  const products = (body.products as Record<string, unknown>[]) || []
  const count = asNumber(body.count) || products.length

  assert(
    `Ürün sayısı ≈ ${env.expectedProductCount}`,
    count >= env.expectedProductCount - 5 &&
      count <= env.expectedProductCount + 15,
    `count=${count}, beklenen≈${env.expectedProductCount}`
  )
  assert("En az 1 ürün", products.length > 0, `len=${products.length}`)

  const cats = await storeFetch(
    env,
    `/store/product-categories?limit=50&fields=id,name,handle`
  )
  assertStatus("GET /store/product-categories", cats.status, 200)
  const categories =
    (asRecord(cats.body).product_categories as unknown[]) || []
  assert("Kategoriler dolu", categories.length > 0, `count=${categories.length}`)

  const cols = await storeFetch(
    env,
    `/store/collections?limit=50&fields=id,title,handle`
  )
  assertStatus("GET /store/collections", cols.status, 200)
  const collections = (asRecord(cols.body).collections as unknown[]) || []
  assert(
    "Koleksiyonlar okunabiliyor",
    cols.status === 200,
    `count=${collections.length}`
  )

  const hasPrice = (v: Record<string, unknown>) => {
    const price = v.calculated_price as Record<string, unknown> | undefined
    return (
      price?.calculated_amount != null ||
      price?.calculated_amount_with_tax != null
    )
  }

  const inStock = (v: Record<string, unknown>) => {
    if (v.manage_inventory === false) return true
    const q = v.inventory_quantity
    if (q == null) return true
    return asNumber(q) > 0
  }

  let chosen =
    (env.productHandle
      ? products.find((p) => p.handle === env.productHandle)
      : undefined) ||
    products.find((p) => {
      const variants = (p.variants as Record<string, unknown>[]) || []
      return variants.some((v) => hasPrice(v) && inStock(v))
    }) ||
    products.find((p) => {
      const variants = (p.variants as Record<string, unknown>[]) || []
      return variants.some((v) => hasPrice(v))
    }) ||
    products[0]

  if (!chosen) {
    assert("Ürün seçimi", false, "katalog boş")
    return null
  }

  const handle = String(chosen.handle || "")
  const detailQs = new URLSearchParams({
    handle,
    region_id: regionId,
    country_code: "tr",
    fields:
      "id,title,handle,*variants,*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory",
  })

  const detail = await storeFetch(env, `/store/products?${detailQs}`)
  assertStatus(`Ürün detay handle=${handle}`, detail.status, 200)
  if (detail.status !== 200) {
    assert("Ürün detay hata", false, bodyMessage(detail.body))
  }
  const detailed =
    ((asRecord(detail.body).products as Record<string, unknown>[]) || [])[0] ||
    chosen

  const variants = (detailed.variants as Record<string, unknown>[]) || []
  assert("Varyantlar var", variants.length > 0, `count=${variants.length}`)

  const variant =
    variants.find((v) => hasPrice(v) && inStock(v)) ||
    variants.find((v) => hasPrice(v)) ||
    variants[0]

  const priceObj = variant?.calculated_price as
    | Record<string, unknown>
    | undefined
  const unitPrice = asNumber(
    priceObj?.calculated_amount ?? priceObj?.calculated_amount_with_tax
  )
  assert("Fiyat (major-unit) geliyor", unitPrice > 0, `price=${unitPrice}`)

  const inv =
    variant?.inventory_quantity == null
      ? null
      : asNumber(variant.inventory_quantity)
  const hasInvField =
    variant != null &&
    Object.prototype.hasOwnProperty.call(variant, "inventory_quantity")
  if (hasInvField) {
    assert(
      "Stok bilgisi (inventory_quantity)",
      inv === null || (typeof inv === "number" && inv >= 0),
      inv == null ? "null" : `qty=${inv}`
    )
  } else {
    skip(
      "Stok bilgisi (inventory_quantity)",
      "Alan yanıtta yok — fields/+variants.inventory_quantity kontrol edin"
    )
  }

  if (!variant?.id || !detailed.id || !handle) {
    return null
  }

  return {
    productId: String(detailed.id),
    handle,
    variantId: String(variant.id),
    unitPrice,
    inventoryQuantity: inv,
    regionId,
  }
}
