/**
 * Storefront URL şeması (Türkçe yollar):
 *   ürün:      /urun/{handle}
 *   kategori:  /urun-kategori/{handle}
 *   koleksiyon /urun-kategori/koleksiyon/{handle}
 * Medusa handle'ı URL slug'ı olarak aynen kullanılır (ayrı eşleme tablosu yok).
 */

export const CATEGORY_BASE = "/urun-kategori"
const COLLECTION_SEGMENT = "koleksiyon"

export function productSlug(handle: string): string {
  return handle
}

/** URL slug'ı → Medusa handle (birebir). */
export function productHandleFromSlug(slug: string): string {
  return slug
}

export function productPath(handle: string, query?: string | URLSearchParams): string {
  const qs = query?.toString()
  return `/urun/${encodeURIComponent(productSlug(handle))}${qs ? `?${qs}` : ""}`
}

export function categoryPath(handle?: string | null): string {
  if (!handle) return CATEGORY_BASE
  return `${CATEGORY_BASE}/${handle}`
}

export function collectionPath(handle: string): string {
  return `${CATEGORY_BASE}/${COLLECTION_SEGMENT}/${handle}`
}

/** /urun-kategori/... segmentleri → filtre. Son segment kategori handle'ı sayılır. */
export function listingFromSegments(segments: string[] = []): {
  category?: string
  collection?: string
} {
  if (!segments.length) return {}
  if (segments[0] === COLLECTION_SEGMENT) {
    return segments.length > 1 ? { collection: segments[1] } : { category: COLLECTION_SEGMENT }
  }
  return { category: segments[segments.length - 1] }
}

/** Kategori / koleksiyon listesi + ek filtreler (renk, sıralama, arama). */
export function listingPath(
  filter: { category?: string; collection?: string },
  query?: URLSearchParams
): string {
  const base = filter.collection
    ? collectionPath(filter.collection)
    : categoryPath(filter.category)
  const qs = query?.toString()
  return qs ? `${base}?${qs}` : base
}
