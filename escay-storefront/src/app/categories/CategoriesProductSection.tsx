import { redirect } from "next/navigation"
import {
  PRODUCT_IMAGE,
  sdk,
  storePricingParams,
  variantOriginalAmount,
  variantPriceAmount,
} from "@/lib/medusa"
import { isProductSoldOut, isVariantInStock, lowStockLabelForProduct } from "@/lib/stock"
import { displayColor, resolveCardImages } from "@/lib/product-images"
import { CategoriesBrowse } from "./CategoriesBrowse"
import { type CategoryListProduct } from "./CategoryProductCard"
import styles from "./categories.module.css"
import { listingPath } from "@/lib/urls"

type StoreProduct = Awaited<
  ReturnType<typeof sdk.store.product.list>
>["products"][number]

const FETCH_LIMIT = 200

/**
 * Varyant kartı: bu kategorilerde her varyant (ör. gramaj) ayrı kart olur.
 * Çayda varyantlar gramaj → ürün başına tek kart; boş bırakıldı.
 */
const EXPAND_VARIANTS_CATEGORIES = new Set<string>([])

/** List view: thumbnail + images for hover second angle. */
const PRODUCT_LIST_FIELDS =
  "*variants.calculated_price,*variants.options,*options,*options.values,*collection,*images,+metadata,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder,+thumbnail"

type SearchParams = {
  category?: string
  collection?: string
  color?: string
  sort?: string
  q?: string
}

function productSku(product: StoreProduct): string | null {
  return product.variants?.[0]?.sku ?? null
}

function productColors(product: StoreProduct): string[] {
  const fromOptions =
    product.options?.flatMap((opt) =>
      (opt.values || [])
        .map((v) => (typeof v === "string" ? v : v.value))
        .filter((v): v is string => Boolean(v))
    ) || []

  if (fromOptions.length) {
    return [...new Set(fromOptions)]
  }

  const fromVariants =
    product.variants
      ?.flatMap((v) =>
        (v.options || [])
          .map((o) => o.value)
          .filter((v): v is string => Boolean(v))
      )
      .filter(Boolean) || []

  return [...new Set(fromVariants)]
}

function variantColor(
  variant: NonNullable<StoreProduct["variants"]>[number]
): string | null {
  const fromOptions = (variant.options || [])
    .map((o) => o.value)
    .filter((v): v is string => Boolean(v))
  if (fromOptions.length) return fromOptions[0]
  return variant.title || null
}

function productImage(product: StoreProduct): string {
  return product.thumbnail || PRODUCT_IMAGE
}

function mapProduct(product: StoreProduct): CategoryListProduct {
  const colors = productColors(product)
  const collectionTitle =
    (product as { collection?: { title?: string | null } | null }).collection
      ?.title || null

  const price = product.variants?.[0]?.calculated_price
  const original = product.variants?.[0]?.calculated_price
  const { image, hoverImage } = resolveCardImages({
    thumbnail: product.thumbnail,
    medusaImages: (product.images || []).map((img) => img.url),
    sku: productSku(product),
    color: colors[0] || null,
    handle: product.handle,
  })

  return {
    cardKey: product.id,
    id: product.id,
    variantId: product.variants?.[0]?.id ?? null,
    handle: product.handle,
    title: product.title,
    image,
    hoverImage,
    price: variantPriceAmount(price),
    originalPrice: variantOriginalAmount(original),
    subtitle: collectionTitle || displayColor(colors[0]),
    colorCount: colors.length,
    soldOut: isProductSoldOut(product.variants),
    lowStock: lowStockLabelForProduct(product.variants),
  }
}

function expandVariantCards(product: StoreProduct): CategoryListProduct[] {
  const sku = productSku(product)
  const variants = product.variants || []
  if (!variants.length) return [mapProduct(product)]

  const productLowStock = lowStockLabelForProduct(variants)

  return variants.map((variant) => {
    const color = variantColor(variant)
    const label = displayColor(color)
    const calc = variant.calculated_price
    const { image, hoverImage } = resolveCardImages({
      thumbnail: product.thumbnail,
      medusaImages: (product.images || []).map((img) => img.url),
      sku,
      color,
      handle: product.handle,
    })
    const soldOut = !isVariantInStock(variant)

    return {
      cardKey: `${product.id}:${variant.id}`,
      id: product.id,
      variantId: variant.id,
      handle: product.handle,
      title: label ? `${product.title} – ${label}` : product.title,
      image: image || productImage(product),
      hoverImage,
      price: variantPriceAmount(calc),
      originalPrice: variantOriginalAmount(calc),
      subtitle: label,
      colorCount: 0,
      soldOut,
      // Total product stock — never a single thin color (avoids misleading "Son 1").
      lowStock: soldOut ? null : productLowStock,
    }
  })
}

export async function CategoriesProductSection({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = searchParams

  if (sp.category === "koleksiyon") {
    const params = new URLSearchParams()
    if (sp.color) params.set("color", sp.color)
    if (sp.sort && sp.sort !== "newest") params.set("sort", sp.sort)
    if (sp.q?.trim()) params.set("q", sp.q.trim())
    redirect(listingPath({ category: "harmanlar" }, params))
  }

  const sort = sp.sort || "newest"
  const browsingCollection = Boolean(sp.collection)
  const expandVariants = Boolean(
    (sp.category && EXPAND_VARIANTS_CATEGORIES.has(sp.category)) ||
      browsingCollection
  )

  const [{ product_categories }, { collections }] = await Promise.all([
    sdk.store.category.list({
      limit: 50,
      fields: "*category_children,*parent_category",
    }),
    sdk.store.collection.list({ limit: 20 }),
  ])

  const selectedCategory = product_categories.find(
    (c) => c.handle === sp.category
  )
  const selectedCollection = collections.find((c) => c.handle === sp.collection)
  const collectionIds = selectedCollection?.id
    ? [selectedCollection.id]
    : undefined

  // Unknown collection handle (e.g. not seeded yet) → no products, not the whole catalog.
  const unknownCollection = Boolean(sp.collection && !selectedCollection)

  const { products } = unknownCollection
    ? { products: [] as StoreProduct[] }
    : await sdk.store.product.list({
        limit: FETCH_LIMIT,
        offset: 0,
        q: sp.q?.trim() || undefined,
        ...storePricingParams(),
        category_id: selectedCategory ? [selectedCategory.id] : undefined,
        collection_id: collectionIds,
        fields: PRODUCT_LIST_FIELDS,
        order: sort === "newest" ? "-created_at" : undefined,
      })

  const ordered = products

  let cards: CategoryListProduct[] = expandVariants
    ? ordered.flatMap(expandVariantCards)
    : ordered.map(mapProduct)

  const colorOptions = [
    ...new Set(
      cards
        .map((c) => c.subtitle)
        .filter((c): c is string => Boolean(c && !c.includes(",")))
    ),
  ]
    .sort((a, b) => a.localeCompare(b, "tr"))
    .map((value) => ({ value, label: value }))

  if (sp.color) {
    const needle = sp.color.toLocaleLowerCase("tr")
    cards = cards.filter(
      (c) => c.subtitle?.toLocaleLowerCase("tr") === needle
    )
  }

  if (sort === "price-asc") {
    cards = [...cards].sort((a, b) => {
      if (a.price == null && b.price == null) return 0
      if (a.price == null) return 1
      if (b.price == null) return -1
      return a.price - b.price
    })
  } else if (sort === "price-desc") {
    cards = [...cards].sort((a, b) => {
      if (a.price == null && b.price == null) return 0
      if (a.price == null) return 1
      if (b.price == null) return -1
      return b.price - a.price
    })
  }

  // Tükenen kartlar her sıralamada en alta; kendi aralarındaki sıra korunur (stable sort).
  cards = [...cards].sort((a, b) => Number(a.soldOut) - Number(b.soldOut))

  const collectionOptions = collections.map((c) => ({
    value: c.handle,
    label: c.title,
  }))

  const pageTitle =
    selectedCollection?.title || selectedCategory?.name || "Tüm Çaylar"

  return (
    <div className={styles.page} data-page-content="categories">
      <header className={styles.head}>
        <h1 className={styles.title}>{pageTitle}</h1>
      </header>

      <CategoriesBrowse
        products={cards}
        collections={collectionOptions}
        colors={colorOptions}
        selected={{
          category: sp.category,
          collection: sp.collection,
          color: sp.color,
          sort,
          q: sp.q,
        }}
      />
    </div>
  )
}
