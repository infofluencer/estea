import type { FeaturedProduct } from "@/components/FeaturedProductsCarousel"
import {
  PRODUCT_IMAGE,
  sdk,
  storePricingParams,
  variantOriginalAmount,
  variantPriceAmount,
} from "@/lib/medusa"
import { isProductSoldOut, isVariantInStock } from "@/lib/stock"
import {
  displayColor,
  normalizeProductSku,
  resolveCardImages,
} from "@/lib/product-images"

export type StoreProduct = Awaited<
  ReturnType<typeof sdk.store.product.list>
>["products"][number]

export const FEATURED_FIELDS =
  "*variants.calculated_price,*variants.options,*images,*categories,*collection,+metadata,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder"

function variantColor(
  variant: NonNullable<StoreProduct["variants"]>[number] | undefined
): string | null {
  if (!variant) return null
  const fromOptions = (variant.options || [])
    .map((o) => o.value)
    .filter((v): v is string => Boolean(v))
  if (fromOptions.length) return fromOptions[0]
  const title = variant.title?.trim()
  return title && title !== "Default" ? title : null
}

/** One card per color/variant — same merchandising rule as category grids. */
export function mapFeaturedProducts(products: StoreProduct[]): FeaturedProduct[] {
  return products.flatMap((p) => {
    const variants = p.variants?.length ? p.variants : [undefined]
    const sku = normalizeProductSku(p.variants?.[0]?.sku)

    return variants.map((variant) => {
      const price = variant?.calculated_price
      const color = variantColor(variant)
      const { image, hoverImage } = resolveCardImages({
        thumbnail: p.thumbnail,
        medusaImages: (p.images || []).map((img) => img.url),
        sku,
        color,
        handle: p.handle,
      })

      return {
        id: variant ? `${p.id}:${variant.id}` : p.id,
        handle: p.handle,
        title: displayColor(color) ? `${p.title} – ${displayColor(color)}` : p.title,
        variantId: variant?.id ?? null,
        thumbnail: image || p.thumbnail || PRODUCT_IMAGE,
        image,
        hoverImage,
        images: hoverImage ? [image, hoverImage] : [image],
        price: variantPriceAmount(price),
        originalPrice: variantOriginalAmount(price),
        soldOut: variant
          ? !isVariantInStock(variant)
          : isProductSoldOut(p.variants),
      }
    })
  })
}

/**
 * Merchandising buckets that span unrelated product lines ("Yeni" holds scarves,
 * shawls and art prints alike) — they say nothing about similarity.
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

  // One card per product first (in-stock color preferred) so a single
  // many-color scarf can't fill the whole row; extra colors only top it up.
  const perProduct = pool.map((p) => {
    const cards = mapFeaturedProducts([p])
    return [...cards.filter((c) => !c.soldOut), ...cards.filter((c) => c.soldOut)]
  })
  const out: FeaturedProduct[] = []
  for (let round = 0; out.length < limit; round++) {
    let added = false
    for (const cards of perProduct) {
      if (round < cards.length && out.length < limit) {
        out.push(cards[round])
        added = true
      }
    }
    if (!added || round >= 1) break
  }
  return out
}
