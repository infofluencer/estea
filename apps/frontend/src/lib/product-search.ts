import { sdk, storePricingParams } from "@/lib/medusa"

type StoreProduct = Awaited<
  ReturnType<typeof sdk.store.product.list>
>["products"][number]

/** Header kutusu ve /search sayfası aynı alanları kullanır. */
const SEARCH_FIELDS =
  "*variants.calculated_price,*variants.options,*images,*collection,+metadata,+thumbnail,+description,+variants.sku,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder"

const CATALOG_LIMIT = 300
const CATALOG_TTL_MS = 60_000

let catalogCache: { at: number; products: Promise<StoreProduct[]> } | null = null

/**
 * Katalog küçük (~50 ürün) → tamamı çekilip burada sıralanır. Medusa `q`
 * açıklamada da alt-dize arar ("iyon" ⊂ "koleksiyon") ve sıralama yapmaz.
 */
function loadCatalog(): Promise<StoreProduct[]> {
  const now = Date.now()
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.products
  }
  const products = sdk.store.product
    .list({ limit: CATALOG_LIMIT, ...storePricingParams(), fields: SEARCH_FIELDS })
    .then((r) => r.products)
  catalogCache = { at: now, products }
  products.catch(() => {
    if (catalogCache?.products === products) catalogCache = null
  })
  return products
}

const FOLD: Record<string, string> = { ı: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c" }

/** Türkçe küçük harf + aksan katlama: "İyon" / "Iyon" / "iyon" → "iyon". */
export function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[ışğüöç]/g, (c) => FOLD[c])
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function words(text: string): string[] {
  return normalizeSearchText(text).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Levenshtein, `max`'ı aşınca erken çıkar. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

function fuzzyWordMatch(word: string, token: string): boolean {
  if (token.length < 3) return false
  const max = token.length >= 6 ? 2 : 1
  // "ion" ~ "iyon", "kortin" ~ "korint"; uzun kelimede yazılan kadar başını karşılaştır.
  return (
    withinEdits(word, token, max) ||
    (word.length > token.length &&
      withinEdits(word.slice(0, token.length + 1), token, max))
  )
}

function tokenScore(product: StoreProduct, token: string): number {
  const titleWords = words(product.title || "")
  if (titleWords.some((w) => w.startsWith(token))) return 10
  if (titleWords.some((w) => w.includes(token))) return 6

  const variants = product.variants || []
  const skus = variants.map((v) => normalizeSearchText(v.sku || "")).filter(Boolean)
  if (skus.some((s) => s.includes(token))) return 8

  const optionWords = variants.flatMap((v) => [
    ...(v.options || []).flatMap((o) => words(o.value || "")),
    ...words(v.title || ""),
  ])
  if (optionWords.some((w) => w.startsWith(token))) return 5

  const collection = (product as { collection?: { title?: string | null } | null })
    .collection?.title
  if (collection && words(collection).some((w) => w.startsWith(token))) return 3

  if (titleWords.some((w) => fuzzyWordMatch(w, token))) return 4
  if (optionWords.some((w) => fuzzyWordMatch(w, token))) return 2

  // Açıklamada yalnızca kelime başı: "iyon" "koleksiyon"u yakalamasın.
  if (words(product.description || "").some((w) => w.startsWith(token))) return 1
  return 0
}

/** Ad eşleşmesi önce; her kelime bir yerde eşleşmeli. */
export async function searchCatalog(q: string, limit: number): Promise<StoreProduct[]> {
  const tokens = words(q)
  if (!tokens.length) return []
  const catalog = await loadCatalog()

  return catalog
    .map((product) => {
      let score = 0
      for (const token of tokens) {
        const s = tokenScore(product, token)
        if (!s) return null
        score += s
      }
      return { product, score }
    })
    .filter((hit): hit is { product: StoreProduct; score: number } => hit !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.product.title || "").localeCompare(b.product.title || "", "tr")
    )
    .slice(0, limit)
    .map((hit) => hit.product)
}
