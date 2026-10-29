/**
 * WooCommerce ürün CSV'si → Medusa ürün planı (saf, DB'siz).
 *
 * Eski market.esteacay.com WordPress mağazasının "simple" ürünleri burada
 * çay modeline çevrilir: ürün başına tek kayıt, gramaj/paket varyantları.
 * Gruplama CSV'deki WooCommerce kimliğine göre AÇIKÇA tanımlıdır (isimler
 * tutarsız: "Gold Karadeniz Çayı 1000 gr" / "Gold Çay 5000 gr"). Tanımsız
 * kimlik atlanır ve uyarı döner; sessizce ürün uydurulmaz.
 *
 * Çalıştıran: src/scripts/import-wc-products.ts
 */

export type WcRow = Record<string, string>

export type PlanVariant = {
  title: string
  sku: string
  wcId: string
  wcSku: string
  /** TRY, KDV dahil (region tax_inclusive). */
  price: number
  /** null → WooCommerce'te stok takibi yoktu ("Stokta?" = 1). */
  stock: number | null
  manageInventory: boolean
}

export type PlanProduct = {
  handle: string
  title: string
  subtitle: string | null
  optionTitle: "Gramaj" | "Paket"
  categoryHandles: string[]
  /** public/urunler altındaki dosya adları (sıralı, ilk = thumbnail). */
  images: string[]
  story: string | null
  specifications: Record<string, string>
  status: "published" | "draft"
  wcIds: string[]
  variants: PlanVariant[]
}

export type Plan = {
  products: PlanProduct[]
  warnings: string[]
}

type FamilyDef = {
  handle: string
  title: string
  subtitle?: string
  optionTitle: "Gramaj" | "Paket"
  categoryHandles: string[]
  skuPrefix: string
  /** WooCommerce kimliği → varyant başlığı + SKU eki (sıra = görünüm sırası). */
  rows: { wcId: string; variant: string; skuSuffix: string }[]
}

/** Kategori handle'ları seed-escay.ts ile aynı; "seker" import script'inde ensure edilir. */
export const WC_FAMILIES: FamilyDef[] = [
  {
    handle: "gold-karadeniz-cayi",
    title: "Gold Karadeniz Çayı",
    subtitle: "Dökme siyah çay",
    optionTitle: "Gramaj",
    categoryHandles: ["siyah-cay"],
    skuPrefix: "ESC-GOLD",
    rows: [
      { wcId: "4870", variant: "500 gr", skuSuffix: "500" },
      { wcId: "4837", variant: "1000 gr", skuSuffix: "1000" },
      { wcId: "4871", variant: "5000 gr", skuSuffix: "5000" },
    ],
  },
  {
    handle: "ilk-hasat-cay",
    title: "İlk Hasat Çay",
    subtitle: "Dökme siyah çay",
    optionTitle: "Gramaj",
    categoryHandles: ["siyah-cay"],
    skuPrefix: "ESC-HASAT",
    rows: [
      { wcId: "4872", variant: "500 gr", skuSuffix: "500" },
      { wcId: "4839", variant: "1000 gr", skuSuffix: "1000" },
      { wcId: "5301", variant: "5000 gr", skuSuffix: "5000" },
    ],
  },
  {
    handle: "karadeniz-cayi",
    title: "Karadeniz Çayı",
    subtitle: "Dökme siyah çay",
    optionTitle: "Gramaj",
    categoryHandles: ["siyah-cay"],
    skuPrefix: "ESC-KARADENIZ",
    rows: [
      { wcId: "4873", variant: "500 gr", skuSuffix: "500" },
      { wcId: "4844", variant: "1000 gr", skuSuffix: "1000" },
      { wcId: "5305", variant: "5000 gr", skuSuffix: "5000" },
    ],
  },
  {
    handle: "tiryaki-cayi",
    title: "Tiryaki Çayı",
    subtitle: "Dökme siyah çay",
    optionTitle: "Gramaj",
    categoryHandles: ["siyah-cay"],
    skuPrefix: "ESC-TIRYAKI",
    rows: [
      { wcId: "5204", variant: "500 gr", skuSuffix: "500" },
      { wcId: "5246", variant: "1000 gr", skuSuffix: "1000" },
    ],
  },
  {
    handle: "demlik-suzen-poset-cay",
    title: "Demlik Süzen Poşet Çay",
    subtitle: "Siyah çay",
    optionTitle: "Gramaj",
    categoryHandles: ["siyah-cay"],
    skuPrefix: "ESC-DEMLIK",
    rows: [
      { wcId: "4841", variant: "2000 gr", skuSuffix: "2000" },
      { wcId: "4842", variant: "6000 gr", skuSuffix: "6000" },
    ],
  },
  {
    handle: "earl-grey-demlik-suzen-poset-cay",
    title: "Earl Grey Demlik Süzen Poşet Çay",
    subtitle: "Bergamot aromalı siyah çay",
    optionTitle: "Gramaj",
    categoryHandles: ["siyah-cay", "harmanlar"],
    skuPrefix: "ESC-EARLGREY",
    rows: [
      { wcId: "5210", variant: "1050 gr", skuSuffix: "1050" },
      { wcId: "5380", variant: "6000 gr", skuSuffix: "6000" },
    ],
  },
  {
    handle: "kup-seker",
    title: "Küp Şeker",
    subtitle: "Çayın yanına",
    optionTitle: "Gramaj",
    categoryHandles: ["seker"],
    skuPrefix: "ESC-SEKER",
    rows: [
      { wcId: "5206", variant: "1000 gr", skuSuffix: "1000" },
      { wcId: "5208", variant: "5000 gr Tek Sargılı", skuSuffix: "5000S" },
    ],
  },
  ...(
    [
      ["5307", "bogurtlen-cayi", "Böğürtlen Çayı", "BOGURTLEN", ["bitki-cayi"]],
      ["5310", "ihlamur-cayi", "Ihlamur Çayı", "IHLAMUR", ["bitki-cayi"]],
      ["5312", "kusburnu-cayi", "Kuşburnu Çayı", "KUSBURNU", ["bitki-cayi"]],
      ["5360", "melisa-cayi", "Melisa Çayı", "MELISA", ["bitki-cayi"]],
      ["5362", "yesil-cay-bardak-poset", "Yeşil Çay", "YESIL", ["yesil-cay"]],
      ["5364", "nane-limon-cayi", "Nane Limon Çayı", "NANELIMON", ["bitki-cayi"]],
      ["5366", "papatya-cayi", "Papatya Çayı", "PAPATYA", ["bitki-cayi"]],
      ["5368", "rezene-cayi", "Rezene Çayı", "REZENE", ["bitki-cayi"]],
    ] as const
  ).map(
    ([wcId, handle, title, sku, cats]): FamilyDef => ({
      handle,
      title,
      subtitle: "Bardak poşet",
      optionTitle: "Paket",
      categoryHandles: [...cats],
      skuPrefix: `ESC-${sku}`,
      rows: [{ wcId, variant: "Bardak Poşet", skuSuffix: "BP" }],
    })
  ),
]

/** Import'un ensure edeceği ek kategori (seed listesinde de var). */
export const EXTRA_CATEGORIES = [{ name: "Şeker", handle: "seker" }]

// ---------------------------------------------------------------------------
// CSV (RFC 4180: tırnak, çift tırnak kaçışı, hücre içi satır sonu)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): WcRow[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const records: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ",") {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      cell = ""
      if (row.some((c) => c !== "")) records.push(row)
      row = []
    } else {
      cell += ch
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    if (row.some((c) => c !== "")) records.push(row)
  }
  if (!records.length) return []
  const header = records[0].map((h) => h.replace(/\s+/g, " ").trim())
  return records.slice(1).map((r) => {
    const obj: WcRow = {}
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim()
    })
    return obj
  })
}

// ---------------------------------------------------------------------------
// Metin yardımcıları
// ---------------------------------------------------------------------------

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
}

/** Dosya/URL slug'ı: Türkçe harf katlama, ASCII dışı at, [a-z0-9-]. */
export function slugify(input: string): string {
  const folded = input.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_MAP[c] ?? c)
  return folded
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** WP görsel URL'si → public/urunler dosya adı (hepsi .jpg'ye çevrildi). */
export function imageFileName(url: string): string {
  const raw = decodeURIComponent(url.trim().split("/").pop() || "")
  const base = raw.replace(/\.[a-z0-9]+$/i, "")
  return `${slugify(base)}.jpg`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

/** HTML → düz metin; blok sonları "\n\n" (storefront \n{2,} ile paragraflar). */
export function htmlToText(html: string): string {
  if (!html) return ""
  let s = html.replace(/\\n/g, "\n").replace(/\r/g, "")
  s = s.replace(/<br\s*\/?>/gi, "\n")
  s = s.replace(/<\/(p|div|li|ul|ol|h[1-6]|blockquote|tr)>/gi, "\n\n")
  s = s.replace(/<[^>]+>/g, "")
  s = decodeEntities(s)
  s = s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
  return s.replace(/\n{3,}/g, "\n\n").trim()
}

/** <li> maddeleri (kısa açıklama liste ise) → feature_N için. */
export function htmlBullets(html: string): string[] {
  if (!html) return []
  const out: string[] = []
  const re = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const t = htmlToText(m[1]).replace(/\s+/g, " ").trim()
    if (t) out.push(t)
  }
  return out
}

function toNumber(v: string | undefined): number | null {
  if (v == null) return null
  const s = v.replace(/\s/g, "").replace(",", ".")
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const COL = {
  id: "Kimlik",
  sku: "Stok kodu (SKU)",
  name: "İsim",
  published: "Yayımlanmış",
  short: "Kısa açıklama",
  desc: "Açıklama",
  inStock: "Stokta?",
  stock: "Stok",
  price: "Normal fiyat",
  images: "Görseller",
} as const

export function buildPlan(rows: WcRow[]): Plan {
  const warnings: string[] = []
  const byId = new Map<string, WcRow>()
  for (const r of rows) {
    const id = r[COL.id]
    if (!id) {
      warnings.push(`Kimliksiz satır atlandı: "${r[COL.name] ?? "?"}"`)
      continue
    }
    byId.set(id, r)
  }

  const used = new Set<string>()
  const products: PlanProduct[] = []

  for (const fam of WC_FAMILIES) {
    const variants: PlanVariant[] = []
    const images: string[] = []
    let story: string | null = null
    let bullets: string[] = []
    const wcIds: string[] = []
    let anyPublished = false

    for (const def of fam.rows) {
      const r = byId.get(def.wcId)
      if (!r) {
        warnings.push(`${fam.handle}: WooCommerce #${def.wcId} (${def.variant}) CSV'de yok`)
        continue
      }
      used.add(def.wcId)
      wcIds.push(def.wcId)

      const published = r[COL.published] === "1"
      const price = toNumber(r[COL.price])
      if (price == null || price <= 0) {
        warnings.push(`${fam.handle} ${def.variant}: fiyat yok/geçersiz ("${r[COL.price]}"), varyant atlandı`)
        continue
      }
      if (!published) {
        warnings.push(`${fam.handle} ${def.variant}: WooCommerce'te yayımda değil (#${def.wcId}), varyant atlandı`)
        continue
      }
      anyPublished = true

      const stockRaw = toNumber(r[COL.stock])
      const manageInventory = stockRaw != null
      if (!manageInventory && r[COL.inStock] !== "1") {
        warnings.push(`${fam.handle} ${def.variant}: stok yok ve "Stokta?" ≠ 1, yine de stok takipsiz eklendi`)
      }

      variants.push({
        title: def.variant,
        sku: `${fam.skuPrefix}-${def.skuSuffix}`,
        wcId: def.wcId,
        wcSku: r[COL.sku] ?? "",
        price,
        stock: manageInventory ? Math.max(0, Math.floor(stockRaw!)) : null,
        manageInventory,
      })

      for (const u of (r[COL.images] ?? "").split(",")) {
        const t = u.trim()
        if (!t) continue
        const f = imageFileName(t)
        if (!images.includes(f)) images.push(f)
      }

      if (!story) {
        const long = htmlToText(r[COL.desc] ?? "")
        const shortHtml = r[COL.short] ?? ""
        const shortIsList = /<li[\s>]/i.test(shortHtml)
        const shortText = shortIsList ? "" : htmlToText(shortHtml)
        story = [shortText, long].filter(Boolean).join("\n\n") || null
        if (shortIsList) bullets = htmlBullets(shortHtml)
      }
    }

    if (!variants.length) {
      warnings.push(`${fam.handle}: hiç varyant çıkmadı, ürün atlandı`)
      continue
    }

    const specifications: Record<string, string> = {}
    if (fam.optionTitle === "Gramaj") {
      specifications.weight = variants.map((v) => v.title).join(" / ")
    }
    bullets.forEach((b, i) => {
      specifications[`feature_${i + 1}`] = b
    })

    products.push({
      handle: fam.handle,
      title: fam.title,
      subtitle: fam.subtitle ?? null,
      optionTitle: fam.optionTitle,
      categoryHandles: fam.categoryHandles,
      images,
      story,
      specifications,
      status: anyPublished ? "published" : "draft",
      wcIds,
      variants,
    })
  }

  for (const [id, r] of byId) {
    if (!used.has(id)) {
      warnings.push(`Eşleşmeyen WooCommerce ürünü atlandı: #${id} "${r[COL.name]}"`)
    }
  }

  return { products, warnings }
}
