/**
 * Ürünler aynı listede göründüğünde (kategori, benzer ürünler, arama eşitliği)
 * bu sırayla gelir. Listede olmayan ürünler bunlardan sonra, kendi sıralarıyla.
 */
const PRODUCT_ORDER = [
  "ilk-hasat-cay",
  "gold-karadeniz-cayi",
  "karadeniz-cayi",
  "tiryaki-cayi",
  "demlik-suzen-poset-cay",
  "earl-grey-demlik-suzen-poset-cay",
] as const

const RANK = new Map<string, number>(PRODUCT_ORDER.map((h, i) => [h, i]))

export function productRank(handle?: string | null): number {
  return (handle ? RANK.get(handle) : undefined) ?? PRODUCT_ORDER.length
}

/** Sabit sıraya göre dizer; sırası tanımsız ürünlerin kendi aralarındaki sırası korunur. */
export function sortByProductOrder<T>(items: T[], handleOf: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => productRank(handleOf(a)) - productRank(handleOf(b)))
}
