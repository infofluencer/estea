/**
 * Medusa varyant → Parasut ürün eşleştirmesi (salt hesap; I/O yok).
 *
 * Sıra: code = sku → barcode = sku → güncel "Ürün - Renk" (en yeni id) → normalize isim
 * (varyant / ana ürün) → aynı renk eski nesil (en çok faturalı, şüpheli) → benzer isim
 * (şüpheli). Parasut'ta Woo dış referansı yok; code/barcode canlıda boş.
 */

import type { ParasutProductRecord } from "../modules/parasut/types"

export type MedusaVariantRow = {
  variantId: string
  sku: string | null
  variantTitle: string | null
  productId: string
  productTitle: string
  productHandle: string | null
  productStatus: string | null
  wcSku: string | null
  /** KDV dahil TRY (major unit) */
  priceTry: number | null
  variantCount: number
}

export type MatchMethod =
  | "code"
  | "barcode"
  | "name_current"
  | "name_family"
  | "name_exact"
  | "name_parent"
  | "name_fuzzy"
  | "none"

export type MatchTier = "exact" | "high" | "suspicious" | "unmatched"

export type MatchEntry = {
  variant_id: string
  sku: string | null
  product_id: string
  product_title: string
  variant_title: string | null
  product_status: string | null
  parasut_product_id: string | null
  parasut_name: string | null
  parasut_code: string | null
  method: MatchMethod
  tier: MatchTier
  confidence: number
  reasons: string[]
  price_check: {
    medusa_gross: number | null
    parasut_list_price: number | null
    parasut_vat_rate: number | null
    ok: boolean | null
  }
  alternatives?: { id: string; name: string; score: number }[]
}

const FUZZY_MIN = 0.6
const FUZZY_MARGIN = 0.1
const PRICE_TOLERANCE = 0.02
const PLACEHOLDER_VARIANT_TITLES = new Set(["standart", "default", "default title", "varsayilan"])
const SHIPPING_WORDS = ["kargo", "nakliye", "gonderim", "teslimat", "shipping"]

export function normalizeName(value: string | null | undefined): string {
  let s = (value || "").toLocaleLowerCase("tr-TR")
  s = s.replace(/ı/g, "i").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  return s.replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}

function normalizeCode(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase()
}

function tokens(s: string): Set<string> {
  return new Set(s.split(" ").filter(Boolean))
}

/** Token Dice benzerliği 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const A = tokens(normalizeName(a))
  const B = tokens(normalizeName(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter += 1
  return (2 * inter) / (A.size + B.size)
}

function isPlaceholderVariant(title: string | null): boolean {
  return PLACEHOLDER_VARIANT_TITLES.has(normalizeName(title))
}

/** Varyantın Parasut'ta beklenen isimleri ("Ürün - Renk", tek varyantlıda ürün adı). */
export function variantNameCandidates(v: MedusaVariantRow): string[] {
  const out: string[] = []
  const title = v.productTitle.trim()
  const vt = (v.variantTitle || "").trim()
  if (vt && !isPlaceholderVariant(vt)) out.push(`${title} ${vt}`)
  if (v.variantCount <= 1 || !vt || isPlaceholderVariant(vt)) out.push(title)
  return [...new Set(out.map(normalizeName))].filter(Boolean)
}

/**
 * Woo→Parasut adı: "<o dönemki ürün adı>[ - Renk] <kısa ad> / <Renk>".
 * Renk son " / " sonrası; prefix normalize edilmiş ön kısım.
 */
export function splitParasutName(name: string): {
  prefix: string
  color: string | null
} {
  const i = name.lastIndexOf(" / ")
  if (i < 0) return { prefix: normalizeName(name), color: null }
  return {
    prefix: normalizeName(name.slice(0, i)),
    color: normalizeName(name.slice(i + 3)) || null,
  }
}

function newerId(a: ParasutProductRecord, b: ParasutProductRecord): number {
  const na = Number(a.id)
  const nb = Number(b.id)
  if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
  return b.id.localeCompare(a.id)
}

/**
 * Aynı renkte birden çok nesil kayıt (ürün yeniden adlandırıldıkça Woo yeni kayıt açmış).
 * current: prefix güncel "Ürün adı - Renk" ile başlıyor → en yeni id.
 * family: renk aynı + ürün adının tüm kelimeleri prefix'te → en çok faturalı (şüpheli).
 */
function pickByGeneration(
  v: MedusaVariantRow,
  products: ParasutProductRecord[]
): {
  current: ParasutProductRecord | null
  currentCount: number
  family: ParasutProductRecord[]
} {
  const color = normalizeName(v.variantTitle)
  if (!color || isPlaceholderVariant(v.variantTitle)) {
    return { current: null, currentCount: 0, family: [] }
  }
  const expected = normalizeName(`${v.productTitle} ${v.variantTitle}`)
  const titleTokens = [...tokens(normalizeName(v.productTitle))]

  const sameColor = products.filter((p) => splitParasutName(p.name).color === color)
  const current = sameColor
    .filter((p) => {
      const { prefix } = splitParasutName(p.name)
      return prefix === expected || prefix.startsWith(`${expected} `)
    })
    .sort(newerId)
  const family = sameColor
    .filter((p) => {
      const prefixTokens = tokens(splitParasutName(p.name).prefix)
      return titleTokens.length > 0 && titleTokens.every((t) => prefixTokens.has(t))
    })
    .sort(
      (a, b) =>
        (b.salesInvoiceDetailsCount || 0) - (a.salesInvoiceDetailsCount || 0) ||
        newerId(a, b)
    )
  return { current: current[0] ?? null, currentCount: current.length, family }
}

export function priceMatches(
  gross: number | null,
  listPrice: number | null,
  vatRate: number | null
): boolean | null {
  if (gross == null || gross <= 0 || listPrice == null || listPrice <= 0) return null
  const within = (x: number) => Math.abs(x - gross) / gross <= PRICE_TOLERANCE
  if (within(listPrice)) return true
  if (vatRate != null && vatRate >= 0 && within(listPrice * (1 + vatRate / 100))) return true
  return false
}

function pushIndex(map: Map<string, ParasutProductRecord[]>, key: string, p: ParasutProductRecord) {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(p)
  else map.set(key, [p])
}

/** Tek aday; birden çoksa arşivli olmayan tek kayıt varsa onu seç. */
function pickOne(list: ParasutProductRecord[] | undefined): {
  product: ParasutProductRecord | null
  ambiguous: ParasutProductRecord[]
} {
  if (!list?.length) return { product: null, ambiguous: [] }
  if (list.length === 1) return { product: list[0], ambiguous: [] }
  const active = list.filter((p) => !p.archived)
  if (active.length === 1) return { product: active[0], ambiguous: [] }
  return { product: null, ambiguous: list }
}

export type ProductMatchReport = {
  census: {
    parasut_total: number
    code_filled: number
    barcode_filled: number
    archived: number
    code_matches_medusa_sku: number
    barcode_matches_medusa_sku: number
    samples: Pick<ParasutProductRecord, "id" | "name" | "code" | "barcode">[]
  }
  summary: {
    medusa_variants: number
    exact: number
    high: number
    suspicious: number
    unmatched: number
    by_method: Record<MatchMethod, number>
  }
  /** Yalnızca exact + high — insan onayından sonra uygulanacak */
  mapping: Record<string, string>
  entries: MatchEntry[]
  suspicious: MatchEntry[]
  unmatched: MatchEntry[]
  shipping_candidates: Pick<
    ParasutProductRecord,
    "id" | "name" | "code" | "vatRate" | "archived" | "salesInvoiceDetailsCount"
  >[]
  unused_parasut_products: Pick<
    ParasutProductRecord,
    "id" | "name" | "code" | "barcode" | "archived" | "salesInvoiceDetailsCount"
  >[]
}

export function matchVariantsToParasut(
  variants: MedusaVariantRow[],
  products: ParasutProductRecord[]
): ProductMatchReport {
  const byCode = new Map<string, ParasutProductRecord[]>()
  const byBarcode = new Map<string, ParasutProductRecord[]>()
  const byName = new Map<string, ParasutProductRecord[]>()
  for (const p of products) {
    pushIndex(byCode, normalizeCode(p.code), p)
    pushIndex(byBarcode, normalizeCode(p.barcode), p)
    pushIndex(byName, normalizeName(p.name), p)
  }
  const skuSet = new Set(variants.map((v) => normalizeCode(v.sku)).filter(Boolean))
  const fuzzyPool = products.filter((p) => !p.archived && normalizeName(p.name))
  const activeProducts = products.filter((p) => !p.archived)

  const entries: MatchEntry[] = variants.map((v) => {
    const base = {
      variant_id: v.variantId,
      sku: v.sku,
      product_id: v.productId,
      product_title: v.productTitle,
      variant_title: v.variantTitle,
      product_status: v.productStatus,
    }
    const make = (
      product: ParasutProductRecord | null,
      method: MatchMethod,
      tier: MatchTier,
      confidence: number,
      reasons: string[],
      alternatives?: MatchEntry["alternatives"]
    ): MatchEntry => {
      const ok = product ? priceMatches(v.priceTry, product.listPrice, product.vatRate) : null
      const r = [...reasons]
      let t = tier
      if (product?.archived) {
        r.push("Parasut ürünü arşivli")
        if (t === "exact" || t === "high") t = "suspicious"
      }
      if (ok === false) r.push("fiyat Parasut liste fiyatıyla uyuşmuyor (zamanla değişmiş olabilir)")
      return {
        ...base,
        parasut_product_id: product?.id ?? null,
        parasut_name: product?.name ?? null,
        parasut_code: product?.code ?? null,
        method,
        tier: t,
        confidence,
        reasons: r,
        price_check: {
          medusa_gross: v.priceTry,
          parasut_list_price: product?.listPrice ?? null,
          parasut_vat_rate: product?.vatRate ?? null,
          ok,
        },
        ...(alternatives?.length ? { alternatives } : {}),
      }
    }

    const sku = normalizeCode(v.sku)
    if (sku) {
      for (const [index, method] of [
        [byCode, "code"],
        [byBarcode, "barcode"],
      ] as const) {
        const { product, ambiguous } = pickOne(index.get(sku))
        if (product) return make(product, method, "exact", 1, [`${method} = sku`])
        if (ambiguous.length) {
          return make(
            null,
            method,
            "suspicious",
            0.5,
            [`aynı ${method} ile ${ambiguous.length} Parasut ürünü`],
            ambiguous.map((p) => ({ id: p.id, name: p.name, score: 1 }))
          )
        }
      }
    }

    const generation = pickByGeneration(v, activeProducts)
    if (generation.current) {
      const others = generation.family.filter((p) => p.id !== generation.current!.id)
      return make(
        generation.current,
        "name_current",
        "high",
        0.95,
        [
          generation.currentCount > 1
            ? `güncel adla ${generation.currentCount} kayıt — en yeni id seçildi`
            : "güncel ürün adı + renk birebir",
        ],
        others.length
          ? others.map((p) => ({ id: p.id, name: p.name, score: 1 }))
          : undefined
      )
    }

    for (const cand of variantNameCandidates(v)) {
      const { product, ambiguous } = pickOne(byName.get(cand))
      if (product) return make(product, "name_exact", "high", 0.9, ["normalize isim birebir"])
      if (ambiguous.length) {
        return make(
          null,
          "name_exact",
          "suspicious",
          0.5,
          [`aynı isimde ${ambiguous.length} Parasut ürünü`],
          ambiguous.map((p) => ({ id: p.id, name: p.name, score: 1 }))
        )
      }
    }

    if (v.variantCount > 1) {
      const { product } = pickOne(byName.get(normalizeName(v.productTitle)))
      if (product) {
        return make(product, "name_parent", "high", 0.8, [
          "varyant seviyesinde ürün yok — ana ürüne bağlandı",
        ])
      }
    }

    if (generation.family.length) {
      const [best, ...rest] = generation.family
      return make(
        best,
        "name_family",
        "suspicious",
        0.7,
        [
          `güncel adla kayıt yok — aynı renkte ${generation.family.length} eski kayıttan en çok faturalı seçildi (${best.salesInvoiceDetailsCount ?? 0} fatura)`,
        ],
        rest.length ? rest.map((p) => ({ id: p.id, name: p.name, score: 1 })) : undefined
      )
    }

    const candidates = variantNameCandidates(v)
    const scored = fuzzyPool
      .map((p) => ({
        p,
        score: Math.max(...candidates.map((c) => nameSimilarity(c, p.name)), 0),
      }))
      .filter((x) => x.score >= FUZZY_MIN)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    const alternatives = scored.map((x) => ({
      id: x.p.id,
      name: x.p.name,
      score: Math.round(x.score * 100) / 100,
    }))
    if (scored.length) {
      const [best, second] = scored
      const clear = !second || best.score - second.score >= FUZZY_MARGIN
      return make(
        clear ? best.p : null,
        "name_fuzzy",
        "suspicious",
        Math.round(best.score * 100) / 100,
        [clear ? "benzer isim — insan onayı gerekli" : "birden fazla yakın aday"],
        alternatives
      )
    }

    return make(null, "none", "unmatched", 0, ["eşleşme yok"])
  })

  // Aynı Parasut ürünü farklı Medusa ürünlerine / name_parent dışı birden çok varyanta gittiyse şüpheli
  const usage = new Map<string, MatchEntry[]>()
  for (const e of entries) {
    if (!e.parasut_product_id || (e.tier !== "exact" && e.tier !== "high")) continue
    const list = usage.get(e.parasut_product_id)
    if (list) list.push(e)
    else usage.set(e.parasut_product_id, [e])
  }
  for (const list of usage.values()) {
    if (list.length < 2) continue
    const sameProductParent =
      new Set(list.map((e) => e.product_id)).size === 1 &&
      list.every((e) => e.method === "name_parent")
    if (sameProductParent) continue
    for (const e of list) {
      e.tier = "suspicious"
      e.reasons.push(`aynı Parasut ürünü ${list.length} varyanta eşleşti`)
    }
  }

  const mapping: Record<string, string> = {}
  const byMethod: Record<MatchMethod, number> = {
    code: 0,
    barcode: 0,
    name_current: 0,
    name_family: 0,
    name_exact: 0,
    name_parent: 0,
    name_fuzzy: 0,
    none: 0,
  }
  const count = { exact: 0, high: 0, suspicious: 0, unmatched: 0 }
  const used = new Set<string>()
  for (const e of entries) {
    count[e.tier] += 1
    byMethod[e.method] += 1
    if (e.parasut_product_id) used.add(e.parasut_product_id)
    if (e.parasut_product_id && (e.tier === "exact" || e.tier === "high")) {
      mapping[e.variant_id] = e.parasut_product_id
    }
  }

  const shippingCandidates = products
    .filter((p) => {
      const n = normalizeName(p.name)
      return SHIPPING_WORDS.some((w) => n.split(" ").includes(w)) || normalizeCode(p.code) === "kargo"
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      vatRate: p.vatRate,
      archived: p.archived,
      salesInvoiceDetailsCount: p.salesInvoiceDetailsCount,
    }))

  const unused = products
    .filter((p) => !used.has(p.id))
    .sort((a, b) => (b.salesInvoiceDetailsCount || 0) - (a.salesInvoiceDetailsCount || 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      barcode: p.barcode,
      archived: p.archived,
      salesInvoiceDetailsCount: p.salesInvoiceDetailsCount,
    }))

  return {
    census: {
      parasut_total: products.length,
      code_filled: products.filter((p) => p.code).length,
      barcode_filled: products.filter((p) => p.barcode).length,
      archived: products.filter((p) => p.archived).length,
      code_matches_medusa_sku: products.filter((p) => skuSet.has(normalizeCode(p.code))).length,
      barcode_matches_medusa_sku: products.filter((p) => skuSet.has(normalizeCode(p.barcode)))
        .length,
      samples: products.slice(0, 10).map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        barcode: p.barcode,
      })),
    },
    summary: {
      medusa_variants: variants.length,
      ...count,
      by_method: byMethod,
    },
    mapping,
    entries,
    suspicious: entries.filter((e) => e.tier === "suspicious"),
    unmatched: entries.filter((e) => e.tier === "unmatched"),
    shipping_candidates: shippingCandidates,
    unused_parasut_products: unused,
  }
}
