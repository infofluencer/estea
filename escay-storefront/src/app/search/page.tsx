import { CategoryProductCard } from "@/app/categories/CategoryProductCard"
import {
  PRODUCT_IMAGE,
  variantOriginalAmount,
  variantPriceAmount,
} from "@/lib/medusa"
import { isVariantInStock } from "@/lib/stock"
import {
  displayColor,
  resolveCardImages,
} from "@/lib/product-images"
import { searchCatalog } from "@/lib/product-search"
import styles from "./search.module.css"

const SEARCH_PAGE_LIMIT = 24

export const dynamic = "force-dynamic"

type SearchProduct = {
  cardKey: string
  id: string
  handle: string
  title: string
  thumbnail: string
  hoverImage: string | null
  variantId: string | null
  price: number | null
  originalPrice: number | null
  subtitle: string | null
  soldOut: boolean
}

async function searchProducts(q: string): Promise<SearchProduct[]> {
  if (q.length < 2) return []

  try {
    const products = await searchCatalog(q, SEARCH_PAGE_LIMIT)

    return products.flatMap((product) => {
      const variants = product.variants?.length ? product.variants : [undefined]
      const sku = product.variants?.[0]?.sku ?? null

      return variants.map((variant) => {
        const price = variant?.calculated_price
        const color =
          variant?.options
            ?.map((o) => o.value)
            .find((v): v is string => Boolean(v)) ||
          (variant?.title && variant.title !== "Default"
            ? variant.title
            : null)
        const { image, hoverImage } = resolveCardImages({
          thumbnail: product.thumbnail,
          medusaImages: (product.images || []).map((img) => img.url),
          sku,
          color,
          handle: product.handle,
        })
        return {
          cardKey: variant
            ? `${product.id}:${variant.id}`
            : product.id,
          id: product.id,
          handle: product.handle || product.id,
          title: displayColor(color)
            ? `${product.title || "Ürün"} – ${displayColor(color)}`
            : product.title || "Ürün",
          thumbnail: image || product.thumbnail || PRODUCT_IMAGE,
          hoverImage,
          variantId: variant?.id ?? null,
          price: variantPriceAmount(price),
          originalPrice: variantOriginalAmount(price),
          subtitle: displayColor(color),
          soldOut: variant ? !isVariantInStock(variant) : false,
        }
      })
    })
  } catch {
    return []
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q: raw } = await searchParams
  const q = (raw || "").trim()
  const tooShort = q.length > 0 && q.length < 2
  const products = tooShort ? [] : await searchProducts(q)

  return (
    <div className={`page-shell ${styles.wrap}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>Arama</h1>
        {q ? (
          <p className={styles.lead}>
            “{q}” için sonuçlar
            {!tooShort ? ` (${products.length})` : ""}
          </p>
        ) : (
          <p className={styles.lead}>
            Aramak istediğiniz ürünü yazın (en az 2 karakter).
          </p>
        )}
      </header>

      {tooShort ? (
        <p className={styles.empty}>En az 2 karakter girin.</p>
      ) : null}

      {!tooShort && q && products.length === 0 ? (
        <p className={styles.empty}>Sonuç bulunamadı.</p>
      ) : null}

      {!q && !tooShort ? (
        <p className={styles.empty}>Üstteki arama kutusunu kullanın.</p>
      ) : null}

      {products.length > 0 ? (
        <div className={styles.grid}>
          {products.map((p) => (
            <CategoryProductCard
              key={p.cardKey}
              product={{
                cardKey: p.cardKey,
                id: p.id,
                variantId: p.variantId,
                handle: p.handle,
                title: p.title,
                image: p.thumbnail,
                hoverImage: p.hoverImage,
                price: p.price,
                originalPrice: p.originalPrice,
                subtitle: p.subtitle,
                colorCount: 0,
                soldOut: p.soldOut,
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
