import { PRODUCT_IMAGE } from "@/lib/medusa"
import { displayColor } from "@/lib/product-images"
import { productPath } from "@/lib/urls"

type CartVariant = {
  id?: string | null
  title?: string | null
  sku?: string | null
  options?: { value?: string | null }[] | null
} | null

type CartProduct = {
  handle?: string | null
  metadata?: Record<string, unknown> | null
} | null

export type CartLineSource = {
  product_title?: string | null
  title?: string | null
  thumbnail?: string | null
  variant_id?: string | null
  product?: CartProduct
  variant?: CartVariant
}

export function variantLabel(item: { variant?: CartVariant }) {
  const fromOptions = item.variant?.options
    ?.map((o) => o.value)
    .filter(Boolean)
    .join(" / ")
  if (fromOptions) return displayColor(fromOptions)
  const title = item.variant?.title
  if (title && title !== "Default") return displayColor(title)
  return null
}

export function cartLineTitle(item: CartLineSource): string {
  const base = (item.product_title || item.title || "").trim()
  const color = variantLabel(item)
  if (!color) return base
  if (!base) return color
  const needle = color.toLocaleLowerCase("tr")
  if (base.toLocaleLowerCase("tr").includes(needle)) return base
  return `${base} – ${color}`
}

/** Sepet satırı görseli: Medusa thumbnail (gramaj/paket için ayrı görsel yok). */
export function cartLineImage(item: CartLineSource): string {
  return item.thumbnail || PRODUCT_IMAGE
}

export function cartLineHref(item: CartLineSource): string | null {
  const handle = item.product?.handle
  if (!handle) return null
  const variantId = item.variant_id || item.variant?.id
  return variantId
    ? `${productPath(handle)}?v=${encodeURIComponent(variantId)}`
    : `${productPath(handle)}`
}
