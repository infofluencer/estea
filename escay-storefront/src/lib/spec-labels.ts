/**
 * Bilinen özellik anahtarları → akordeon başlığı + ikon.
 * Çay ürünleri: `product.metadata.specifications` içinde bu anahtarlar beklenir.
 */
export const SPEC_META: Record<string, { label: string; icon: SpecIconName }> = {
  origin: { label: "Menşei", icon: "file" },
  weight: { label: "Gramaj", icon: "ruler" },
  harvest: { label: "Hasat / Sürgün", icon: "texture" },
  ingredients: { label: "İçerik", icon: "flask" },
  brew_time: { label: "Demleme Süresi", icon: "flame" },
  brew_temp: { label: "Demleme Sıcaklığı", icon: "flame" },
  brew_dose: { label: "Demleme Oranı", icon: "volume" },
  aroma_notes: { label: "Aroma Notları", icon: "scent" },
  caffeine: { label: "Kafein", icon: "spark" },
  storage: { label: "Saklama Koşulları", icon: "wash" },
  features: { label: "Özellikler", icon: "spark" },
  care: { label: "Saklama Koşulları", icon: "wash" },
}

export type SpecEntry = {
  key: string
  label: string
  icon: SpecIconName
  value: string
  /** When set, render as bullet list instead of a paragraph. */
  bullets?: string[]
}

export type SpecIconName =
  | "fabric"
  | "ruler"
  | "wash"
  | "texture"
  | "volume"
  | "scent"
  | "flame"
  | "flask"
  | "spark"
  | "file"

const SPEC_ORDER = [
  "origin",
  "weight",
  "harvest",
  "ingredients",
  "brew_dose",
  "brew_time",
  "brew_temp",
  "aroma_notes",
  "caffeine",
  "features",
  "storage",
  "care",
] as const

const FEATURE_KEY = /^feature_\d+$/
const WASH_HINT = /sakla|serin|kuru\s*yer|nem|güneş|ağzı\s*kapalı/i

function isWashInstruction(text: string) {
  return WASH_HINT.test(text)
}

/** Merge feature_* rows; normalize misplaced care vs washing notes. */
function consolidateSpecRows(
  rows: SpecEntry[]
): SpecEntry[] {
  const featureRows = rows.filter((r) => FEATURE_KEY.test(r.key))
  if (!featureRows.length) return rows

  const rest = rows.filter((r) => !FEATURE_KEY.test(r.key))
  const bullets: string[] = []
  let washNote: string | null = null

  for (const row of featureRows.sort((a, b) => a.key.localeCompare(b.key))) {
    if (isWashInstruction(row.value)) {
      washNote = washNote || row.value
    } else {
      bullets.push(row.value)
    }
  }

  const careIdx = rest.findIndex((r) => r.key === "care")
  if (careIdx >= 0) {
    const careRow = rest[careIdx]
    if (isWashInstruction(careRow.value)) {
      washNote = washNote || careRow.value
      rest.splice(careIdx, 1)
    } else {
      bullets.unshift(careRow.value)
      rest.splice(careIdx, 1)
    }
  }

  if (bullets.length) {
    rest.push({
      key: "features",
      label: getSpecLabel("features"),
      icon: getSpecIconName("features"),
      value: bullets.join("\n"),
      bullets,
    })
  }

  if (washNote) {
    rest.push({
      key: "care",
      label: getSpecLabel("care"),
      icon: getSpecIconName("care"),
      value: washNote,
    })
  }

  const order = new Map(SPEC_ORDER.map((k, i) => [k, i]))
  return rest.sort((a, b) => {
    const ai = order.get(a.key as (typeof SPEC_ORDER)[number]) ?? 99
    const bi = order.get(b.key as (typeof SPEC_ORDER)[number]) ?? 99
    return ai - bi
  })
}

/** snake_case / camelCase → "Snake Case" */
export function formatSpecKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getSpecLabel(key: string): string {
  return SPEC_META[key]?.label ?? formatSpecKey(key)
}

export function getSpecIconName(key: string): SpecIconName {
  return SPEC_META[key]?.icon ?? "file"
}

export function formatSpecValue(value: unknown): string | null {
  if (value == null) return null
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => (v == null ? "" : String(v).trim()))
      .filter(Boolean)
    return parts.length ? parts.join(", ") : null
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  }
  const s = String(value).trim()
  return s || null
}

/** Normalize specifications metadata into renderable rows (known keys first). */
export function getSpecEntries(specifications: unknown): SpecEntry[] {
  const rawMap = normalizeSpecifications(specifications)
  if (!rawMap) return []

  const seen = new Set<string>()
  const rows: SpecEntry[] = []

  const push = (key: string) => {
    if (seen.has(key) || FEATURE_KEY.test(key)) return
    const value = formatSpecValue(rawMap[key])
    if (!value) return
    seen.add(key)
    rows.push({
      key,
      label: getSpecLabel(key),
      icon: getSpecIconName(key),
      value,
    })
  }

  for (const key of SPEC_ORDER) push(key)
  for (const key of Object.keys(rawMap)) {
    if (FEATURE_KEY.test(key)) continue
    push(key)
  }

  for (const key of Object.keys(rawMap).sort()) {
    if (!FEATURE_KEY.test(key) || seen.has(key)) continue
    const value = formatSpecValue(rawMap[key])
    if (!value) continue
    seen.add(key)
    rows.push({
      key,
      label: getSpecLabel(key),
      icon: getSpecIconName(key),
      value,
    })
  }

  return consolidateSpecRows(rows)
}

/** Parse specifications from product metadata (object or JSON string). */
export function normalizeSpecifications(
  specifications: unknown
): Record<string, unknown> | null {
  if (!specifications) return null

  if (typeof specifications === "string") {
    const trimmed = specifications.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
    return null
  }

  if (typeof specifications === "object" && !Array.isArray(specifications)) {
    return specifications as Record<string, unknown>
  }

  return null
}

/**
 * Kategori varsayılanları — ürün metadata'sında özellik yoksa gösterilir.
 * Handle'lar backend seed'iyle aynı (siyah-cay, yesil-cay, bitki-cayi, harmanlar, hediye).
 * TODO(K6): gerçek demleme değerleri ürün ekibiyle doğrulanacak.
 */
const CATEGORY_SPEC_DEFAULTS: Record<string, Record<string, string>> = {
  "siyah-cay": {
    origin: "Rize / Artvin, Doğu Karadeniz",
    brew_dose: "1 litre su için 3 yemek kaşığı (yaklaşık 15 g) kuru çay",
    brew_time: "15–20 dakika",
    brew_temp: "Kaynar su, demlik kısık ateşte",
    storage: "Serin, kuru ve kokusuz bir yerde, ağzı kapalı kapta saklayın.",
  },
  "yesil-cay": {
    origin: "Rize, Doğu Karadeniz",
    brew_dose: "1 fincan (200 ml) için 1 tatlı kaşığı",
    brew_time: "2–3 dakika",
    brew_temp: "75–80 °C (kaynattıktan sonra birkaç dakika dinlendirin)",
    storage: "Serin, kuru ve kokusuz bir yerde, ağzı kapalı kapta saklayın.",
  },
  "bitki-cayi": {
    brew_dose: "1 fincan (200 ml) için 1 tatlı kaşığı",
    brew_time: "5–7 dakika",
    brew_temp: "Kaynar su",
    storage: "Serin, kuru ve kokusuz bir yerde, ağzı kapalı kapta saklayın.",
  },
  harmanlar: {
    origin: "Rize / Artvin, Doğu Karadeniz",
    brew_time: "10–15 dakika",
    brew_temp: "Kaynar su, demlik kısık ateşte",
    storage: "Serin, kuru ve kokusuz bir yerde, ağzı kapalı kapta saklayın.",
  },
}

const CATEGORY_SPEC_PRIORITY = ["yesil-cay", "bitki-cayi", "harmanlar", "siyah-cay"] as const

function categorySpecDefaults(
  categoryHandles?: string[] | null
): Record<string, string> | null {
  if (!categoryHandles?.length) return null
  const set = new Set(categoryHandles)
  const handle = CATEGORY_SPEC_PRIORITY.find((h) => set.has(h))
  return handle ? CATEGORY_SPEC_DEFAULTS[handle] : null
}

/** Resolve spec rows from full product metadata (specifications + legacy flat keys). */
export function resolveSpecEntries(
  metadata: Record<string, unknown> | null | undefined,
  categoryHandles?: string[] | null
): ReturnType<typeof getSpecEntries> {
  const meta = metadata || {}
  const fromSpecs = normalizeSpecifications(meta.specifications)
  const merged: Record<string, unknown> = { ...(fromSpecs || {}) }

  for (const key of SPEC_ORDER) {
    if (merged[key] != null && String(merged[key]).trim()) continue
    const flat = meta[key]
    if (flat != null && String(flat).trim()) merged[key] = flat
  }

  const defaults = categorySpecDefaults(categoryHandles)
  if (defaults) {
    for (const [key, value] of Object.entries(defaults)) {
      if (merged[key] != null && String(merged[key]).trim()) continue
      merged[key] = value
    }
  }

  return getSpecEntries(merged)
}
