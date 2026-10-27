/**
 * Ürün/varyant görsel çözümlemesi — yalnızca Medusa'daki thumbnail ve images.
 * (Görseller Admin'den yüklenir; ayrı SKU → dosya eşlemesi yok.)
 */
import { PRODUCT_IMAGE } from "@/lib/medusa"

/** Tek seçenekli ürünlerin varyant adları; müşteriye etiket olarak gösterilmez. */
const HIDDEN_VARIANT_VALUES = new Set(["Tek Renk", "Standart", "Default", "Default Variant"])

/** Kart/sepet etiketi için varyant adı — "Standart" vb. ise null. */
export function displayColor(color: string | null | undefined): string | null {
  return color && !HIDDEN_VARIANT_VALUES.has(color) ? color : null
}

/** SKU normalizasyonu (büyük harf, alfasayısal). */
export function normalizeProductSku(sku: unknown): string | null {
  if (typeof sku !== "string" || !sku.trim()) return null
  const s = sku.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "")
  return s || null
}

/** Kart görseli + hover görseli: thumbnail, ardından ürün görselleri. */
export function resolveCardImages(input: {
  thumbnail?: string | null
  medusaImages?: string[] | null
}): { image: string; hoverImage: string | null } {
  const images = (input.medusaImages || []).filter(Boolean)
  const image = input.thumbnail || images[0] || PRODUCT_IMAGE
  const hoverImage = images.find((url) => url !== image) || null
  return { image, hoverImage }
}
