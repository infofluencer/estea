import type { FeaturedProduct } from "@/components/FeaturedProductsCarousel"
import {
  PRODUCT_IMAGE,
  sdk,
  storePricingParams,
  variantOriginalAmount,
  variantPriceAmount,
} from "@/lib/medusa"
import { isProductSoldOut, isVariantInStock } from "@/lib/stock"
import { resolveCardImages } from "@/lib/product-images"

export type StoreProduct = Awaited<
  ReturnType<typeof sdk.store.product.list>
>["products"][number]

export const FEATURED_FIELDS =
  "*variants.calculated_price,*variants.options,*images,*categories,*collection,+metadata,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder"

/**
 * Ürün başına tek kart (çay: varyantlar gramaj/paket, ayrı kart olmaz).
 * Fiyat ve sepete ekle için stokta olan ilk varyant, yoksa ilk varyant.
 */
export function mapFeaturedProducts(products: StoreProduct[]): FeaturedProduct[] {
  return products.map((p) => {
    const variants = p.variants || []
    const variant = variants.find((v) => isVariantInStock(v)) || variants[0]
    const price = variant?.calculated_price
    const { image, hoverImage } = resolveCardImages({
      thumbnail: p.thumbnail,
      medusaImages: (p.images || []).map((img) => img.url),
    })

    return {
      id: p.id,
      handle: p.handle,
      title: p.title,
      variantId: variant?.id ?? null,
      thumbnail: image || p.thumbnail || PRODUCT_IMAGE,
      image,
      hoverImage,
      images: hoverImage ? [image, hoverImage] : [image],
      price: variantPriceAmount(price),
      originalPrice: variantOriginalAmount(price),
      soldOut: isProductSoldOut(variants),
    }
  })
}

/**
 * Benzerlik söylemeyen geniş vitrin kategorileri ("Yeni" siyah, yeşil ve bitki
 * çayını birlikte tutar).
 */
const BROAD_CATEGORY_HANDLES = new Set(["yeni", "koleksiyon", "hediye", "indirim"])

type CategoryRef = {
  id?: string | null
  handle?: string | null
  parent_category_id?: string | null
}

function categoriesOf(product: StoreProduct): CategoryRef[] {
  return ((product.categories || []) as CategoryRef[]).filter(
    (c) => c.id && !BROAD_CATEGORY_HANDLES.has(c.handle || "")
  )
}

function collectionIdOf(product: StoreProduct): string | null {
  const nested = (product as { collection?: { id?: string | null } | null })
    .collection?.id
  if (nested) return nested
  const raw = (product as { collection_id?: string | null }).collection_id
  return raw || null
}

/** Exact category match weighs most; sharing only a parent line counts less. */
function relatedScore(current: StoreProduct, candidate: StoreProduct): number {
  const currentCats = categoriesOf(current)
  const exact = new Set(currentCats.map((c) => c.id!))
  const parents = new Set(
    currentCats.map((c) => c.parent_category_id).filter(Boolean) as string[]
  )

  let score = 0
  for (const c of categoriesOf(candidate)) {
    if (exact.has(c.id!)) score += 4
    else if (parents.has(c.id!)) score += 2
    else if (c.parent_category_id && parents.has(c.parent_category_id)) score += 1
  }
  const currentCollection = collectionIdOf(current)
  if (currentCollection && collectionIdOf(candidate) === currentCollection) {
    score += 5
  }
  return score
}

/** Products similar to `current`: same specific category first, then same line. */
export async function listRelatedProducts(
  current: StoreProduct,
  limit = 16
): Promise<FeaturedProduct[]> {
  const currentCats = categoriesOf(current)
  const categoryIds = [
    ...new Set([
      ...currentCats.map((c) => c.id!),
      ...(currentCats.map((c) => c.parent_category_id).filter(Boolean) as string[]),
    ]),
  ]
  const collectionId = collectionIdOf(current)
  if (!categoryIds.length && !collectionId) return []

  const queries = [
    categoryIds.length
      ? sdk.store.product.list({
          limit: 60,
          ...storePricingParams(),
          fields: FEATURED_FIELDS,
          category_id: categoryIds,
        })
      : null,
    collectionId
      ? sdk.store.product.list({
          limit: 60,
          ...storePricingParams(),
          fields: FEATURED_FIELDS,
          collection_id: [collectionId],
        })
      : null,
  ]
  const results = await Promise.all(queries)

  const seen = new Set<string>([current.id])
  const pool: StoreProduct[] = []
  for (const res of results) {
    for (const p of res?.products || []) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      if (relatedScore(current, p) > 0) pool.push(p)
    }
  }

  pool.sort((a, b) => {
    const diff = relatedScore(current, b) - relatedScore(current, a)
    if (diff !== 0) return diff
    return a.title.localeCompare(b.title, "tr")
  })

  return pool.slice(0, limit).map((p) => mapFeaturedProducts([p])[0])
}
