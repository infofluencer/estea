/**
 * BizimHesap stok yanıtı → Medusa stok planı (saf hesap, HTTP/DB yok).
 *
 * Dokümanda products / warehouses / inventory yanıt örnekleri boş; alan adları
 * gerçek Token ile görülene kadar bilinmiyor. Bu yüzden:
 * - bilinen adaylar denenir, BIZIMHESAP_STOCK_SKU_FIELD / _QUANTITY_FIELD ile ezilebilir,
 * - miktarı okunamayan satır 0 SAYILMAZ, o ürüne dokunulmaz,
 * - BizimHesap'ta bulunmayan SKU sıfırlanmaz, rapora yazılır.
 */

export type StockRow = Record<string, unknown>

export type StockFieldOptions = {
  skuField?: string
  quantityField?: string
}

export type ParsedStock = {
  bySku: Map<string, number>
  invalidQuantity: string[]
  duplicates: string[]
  rowsWithoutSku: number
}

export type TrackedVariant = {
  variantId: string
  sku: string
  inventoryItemId: string
  locationId: string
  stocked: number
  reserved: number
}

export type VariantGraphRow = {
  id: string
  sku?: string | null
  manage_inventory?: boolean | null
  inventory_items?:
    | {
        inventory_item_id: string
        required_quantity?: number | null
        inventory?: {
          location_levels?:
            | {
                location_id: string
                stocked_quantity?: number | null
                reserved_quantity?: number | null
              }[]
            | null
        } | null
      }[]
    | null
}

export type OrderGraphRow = {
  status?: string | null
  metadata?: Record<string, unknown> | null
  items?:
    | {
        id?: string | null
        variant_sku?: string | null
        detail?: {
          fulfilled_quantity?: unknown
          return_received_quantity?: unknown
        } | null
      }[]
    | null
}

export type StockChange = {
  variantId: string
  sku: string
  inventoryItemId: string
  locationId: string
  from: number
  to: number
  bizimhesap: number
  inFlight: number
}

export type StockPlan = {
  changes: StockChange[]
  matched: number
  unchanged: number
  missing: string[]
  oversold: { sku: string; target: number; reserved: number }[]
  zeroGuardTripped: boolean
  newlyZero: number
}

const SKU_FIELDS = ["code", "productCode", "stockCode", "sku", "productSku", "urunKodu", "stokKodu"]
const PRODUCT_ID_FIELDS = ["productId", "productGuid", "urunId", "id", "guid"]
const QUANTITY_FIELDS = [
  "quantity",
  "stockQuantity",
  "qty",
  "stock",
  "available",
  "miktar",
  "stokMiktari",
  "balance",
]
const WAREHOUSE_ID_FIELDS = ["id", "guid", "warehouseId", "depoId", "code"]
const ERROR_FIELDS = ["error", "errorText", "errorMessage"]
const MAX_SEARCH_DEPTH = 3
const AMBIGUOUS_GROUPED_NUMBER = /^[1-9]\d{0,2}[.,]\d{3}$/

function isRow(value: unknown): value is StockRow {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readField(row: StockRow, names: string[]): unknown {
  const wanted = names.map((n) => n.toLowerCase())
  const keys = Object.keys(row)
  for (const name of wanted) {
    const key = keys.find((k) => k.toLowerCase() === name)
    if (key !== undefined && row[key] !== null && row[key] !== undefined && row[key] !== "") {
      return row[key]
    }
  }
  return undefined
}

function readText(row: StockRow, names: string[]): string {
  const value = readField(row, names)
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
}

export function normalizeSku(value?: string | null): string {
  return (value ?? "").trim().toUpperCase()
}

/** Yanıt düz dizi ya da sarmalı olabilir; tek satır dizisini bulur, birden çoksa tahmin etmez. */
export function extractRows(body: unknown): StockRow[] {
  if (Array.isArray(body)) return body.filter(isRow)
  if (!isRow(body)) throw new Error("BizimHesap yanıtı beklenmeyen biçimde")

  const error = readText(body, ERROR_FIELDS)
  if (error) throw new Error(`BizimHesap hatası: ${error.slice(0, 300)}`)

  const found: StockRow[][] = []
  let sawEmptyArray = false
  const visit = (node: StockRow, depth: number) => {
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        const rows = value.filter(isRow)
        if (rows.length) found.push(rows)
        else if (!value.length) sawEmptyArray = true
      } else if (isRow(value) && depth < MAX_SEARCH_DEPTH) {
        visit(value, depth + 1)
      }
    }
  }
  visit(body, 1)

  if (found.length > 1) {
    throw new Error(`BizimHesap yanıtında birden çok satır dizisi var: ${Object.keys(body).join(", ")}`)
  }
  if (found.length === 1) return found[0]
  if (sawEmptyArray) return []
  throw new Error(`BizimHesap yanıtında satır dizisi yok: ${Object.keys(body).join(", ")}`)
}

/**
 * 12 · "12" · "12.5" · "12,5" · "1.234,50" · "1,234.50". Okunamazsa null (0 değil).
 * "1.234" hem 1234 hem 1,234 olabilir; tahmin edilmez, o ürüne dokunulmaz.
 */
export function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const s = value.trim().replace(/\s/g, "")
  if (!s || AMBIGUOUS_GROUPED_NUMBER.test(s)) return null
  const lastComma = s.lastIndexOf(",")
  const lastDot = s.lastIndexOf(".")
  let normalized = s
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  } else if (lastComma !== -1) {
    normalized = s.replace(",", ".")
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

export function findWarehouseId(rows: StockRow[]): string {
  return readText(rows[0] ?? {}, WAREHOUSE_ID_FIELDS)
}

export function describeWarehouses(rows: StockRow[]): string {
  return rows.map((r) => JSON.stringify(r).slice(0, 160)).join(" | ")
}

export function needsProductLookup(rows: StockRow[], options: StockFieldOptions = {}): boolean {
  const skuFields = options.skuField ? [options.skuField] : SKU_FIELDS
  return rows.some((row) => !readText(row, skuFields))
}

/**
 * Depo satırları → SKU başına miktar. Satırda stok kodu yoksa ürün listesinden
 * ürün kimliğiyle bulunur.
 */
export function buildStockBySku(
  inventoryRows: StockRow[],
  productRows: StockRow[],
  options: StockFieldOptions = {}
): ParsedStock {
  const skuFields = options.skuField ? [options.skuField] : SKU_FIELDS
  const quantityFields = options.quantityField ? [options.quantityField] : QUANTITY_FIELDS

  const skuByProductId = new Map<string, string>()
  for (const product of productRows) {
    const sku = normalizeSku(readText(product, skuFields))
    const id = readText(product, PRODUCT_ID_FIELDS)
    if (sku && id) skuByProductId.set(id, sku)
  }

  const bySku = new Map<string, number>()
  const invalid = new Set<string>()
  const duplicates = new Set<string>()
  const seen = new Set<string>()
  let rowsWithoutSku = 0

  for (const row of inventoryRows) {
    const sku =
      normalizeSku(readText(row, skuFields)) ||
      skuByProductId.get(readText(row, PRODUCT_ID_FIELDS)) ||
      ""
    if (!sku) {
      rowsWithoutSku++
      continue
    }
    if (seen.has(sku)) {
      duplicates.add(sku)
      bySku.delete(sku)
      continue
    }
    seen.add(sku)

    const quantity = parseQuantity(readField(row, quantityFields))
    if (quantity === null) invalid.add(sku)
    else bySku.set(sku, quantity)
  }

  if (inventoryRows.length && !bySku.size) {
    throw new Error(
      `Depo satırlarında SKU/miktar alanı tanınmadı. Gelen alanlar: ${Object.keys(inventoryRows[0]).join(", ")}`
    )
  }

  return {
    bySku,
    invalidQuantity: [...invalid],
    duplicates: [...duplicates],
    rowsWithoutSku,
  }
}

/**
 * Medusa ile BizimHesap arasındaki adet farkı, satır bazında. Artı: Medusa'dan düştü,
 * faturası yok (kargoda ya da fatura kesilemedi). Eksi: fatura tüm satırı düştü,
 * Medusa yalnız kargolananı (kısmi kargo).
 *
 * Faturalı satırda iade eklenmez: iade faturası panelden elle kesilir, adet
 * BizimHesap'a o zaman döner.
 */
export function computeInFlightBySku(orders: OrderGraphRow[]): Map<string, number> {
  const inFlight = new Map<string, number>()
  for (const order of orders) {
    if (order.status === "canceled") continue
    const invoice = order.metadata?.bizimhesap_invoice as
      | { status?: string; mode?: string; items?: { line_item_id: string; quantity: number }[] }
      | undefined
    const billedByLine = new Map(
      invoice?.status === "created" && invoice.mode === "live"
        ? (invoice.items ?? []).map((line) => [line.line_item_id, line.quantity])
        : []
    )

    for (const item of order.items ?? []) {
      const sku = normalizeSku(item.variant_sku)
      if (!sku) continue
      const fulfilled = Number(item.detail?.fulfilled_quantity) || 0
      const received = Number(item.detail?.return_received_quantity) || 0
      const billed = billedByLine.get(item.id ?? "") ?? 0
      const open = billed > 0 ? fulfilled - billed : fulfilled - received
      if (open !== 0) inFlight.set(sku, (inFlight.get(sku) ?? 0) + open)
    }
  }
  return inFlight
}

/** Yalnız SKU'su olan, tek envanter kalemine 1:1 bağlı ve konumu belli varyantlar eşitlenir. */
export function toTrackedVariants(
  rows: VariantGraphRow[],
  locationId?: string
): { tracked: TrackedVariant[]; skipped: { sku: string; reason: string }[] } {
  const tracked: TrackedVariant[] = []
  const skipped: { sku: string; reason: string }[] = []

  for (const row of rows) {
    if (row.manage_inventory === false) continue
    const sku = (row.sku ?? "").trim()
    const label = sku || row.id
    if (!sku) {
      skipped.push({ sku: label, reason: "SKU yok" })
      continue
    }
    const links = row.inventory_items ?? []
    if (links.length !== 1 || Number(links[0].required_quantity ?? 1) !== 1) {
      skipped.push({ sku: label, reason: "tek envanter kalemine 1:1 bağlı değil" })
      continue
    }
    const levels = links[0].inventory?.location_levels ?? []
    const level = locationId
      ? levels.find((l) => l.location_id === locationId)
      : levels.length === 1
        ? levels[0]
        : undefined
    if (!level) {
      skipped.push({
        sku: label,
        reason: levels.length > 1 ? "birden çok konum, BIZIMHESAP_STOCK_LOCATION_ID gerekli" : "stok konumu yok",
      })
      continue
    }
    tracked.push({
      variantId: row.id,
      sku,
      inventoryItemId: links[0].inventory_item_id,
      locationId: level.location_id,
      stocked: Number(level.stocked_quantity) || 0,
      reserved: Number(level.reserved_quantity) || 0,
    })
  }
  return { tracked, skipped }
}

/**
 * Hedef = BizimHesap miktarı − adet farkı (computeInFlightBySku). Rezerve adetler Medusa'da
 * stocked içinde kaldığı için düşülmez; satılabilir = stocked − reserved.
 */
export function computeStockPlan(input: {
  variants: TrackedVariant[]
  stockBySku: Map<string, number>
  inFlightBySku: Map<string, number>
  maxZeroRatio: number
}): StockPlan {
  const changes: StockChange[] = []
  const missing: string[] = []
  const oversold: StockPlan["oversold"] = []
  let matched = 0

  for (const variant of input.variants) {
    const key = normalizeSku(variant.sku)
    const quantity = input.stockBySku.get(key)
    if (quantity === undefined) {
      missing.push(variant.sku)
      continue
    }
    matched++
    const inFlight = input.inFlightBySku.get(key) ?? 0
    const target = Math.max(0, Math.floor(quantity) - inFlight)
    if (target < variant.reserved) {
      oversold.push({ sku: variant.sku, target, reserved: variant.reserved })
    }
    if (target !== variant.stocked) {
      changes.push({
        variantId: variant.variantId,
        sku: variant.sku,
        inventoryItemId: variant.inventoryItemId,
        locationId: variant.locationId,
        from: variant.stocked,
        to: target,
        bizimhesap: quantity,
        inFlight,
      })
    }
  }

  const newlyZero = changes.filter((c) => c.to === 0 && c.from > 0).length
  // Eşleşenlere göre: eksik gelen yanıtta az ürün döner, gelenlerin hepsi sıfır olabilir.
  const zeroLimit = Math.max(2, Math.floor(matched * input.maxZeroRatio))

  return {
    changes,
    matched,
    unchanged: matched - changes.length,
    missing,
    oversold,
    newlyZero,
    zeroGuardTripped: newlyZero > zeroLimit,
  }
}
