import type { Logger } from "@medusajs/framework/types"

import {
  isMockMode,
  normalizeOptions,
  type BizimhesapOptions,
  type BizimhesapRawOptions,
} from "./options"
import type { BizimhesapPayload } from "./payload"
import { extractRows, type StockRow } from "./stock"
import type {
  BizimhesapConnectionStatus,
  BizimhesapInvoiceResult,
} from "./types"

type InjectedDependencies = {
  logger: Logger
}

/**
 * `rejected: true` → BizimHesap isteği reddetti, kayıt oluşmadı (yeniden denenebilir).
 * `rejected: false` → sonuç belirsiz (zaman aşımı / 5xx / okunamayan yanıt), kayıt oluşmuş olabilir.
 */
export class BizimhesapError extends Error {
  readonly rejected: boolean

  constructor(message: string, rejected: boolean) {
    super(message)
    this.name = "BizimhesapError"
    this.rejected = rejected
  }
}

/** addinvoice yanıtı → sonuç. Başarı: error boş + guid dolu. */
export function parseAddInvoiceResponse(
  httpStatus: number,
  rawBody: string
): { guid: string; url?: string } {
  if (httpStatus >= 500) {
    throw new BizimhesapError(`HTTP ${httpStatus}: ${rawBody.slice(0, 300)}`, false)
  }
  if (httpStatus >= 400) {
    throw new BizimhesapError(`HTTP ${httpStatus}: ${rawBody.slice(0, 300)}`, true)
  }

  let body: { error?: unknown; guid?: unknown; url?: unknown }
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new BizimhesapError(`Okunamayan yanıt: ${rawBody.slice(0, 300)}`, false)
  }

  const error = typeof body?.error === "string" ? body.error.trim() : ""
  if (error) {
    throw new BizimhesapError(error, true)
  }
  const guid = typeof body?.guid === "string" ? body.guid.trim() : ""
  if (!guid) {
    throw new BizimhesapError(`Yanıtta guid yok: ${rawBody.slice(0, 300)}`, false)
  }
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : undefined
  return { guid, url }
}

/**
 * BizimHesap fatura modülü. DB modeli yok; durum sipariş metadata'sında.
 * API'de yalnız addinvoice var: sorgu / güncelleme / silme / idempotency yok,
 * bu yüzden burada otomatik tekrar deneme yapılmaz.
 */
class BizimhesapModuleService {
  protected readonly logger_: Logger
  protected readonly options_: BizimhesapOptions

  constructor(container: InjectedDependencies, options?: BizimhesapRawOptions) {
    this.logger_ = container.logger
    this.options_ = normalizeOptions(options ?? {})

    if (isMockMode(this.options_)) {
      this.logger_.info("[bizimhesap] firmId yok — mock mod (gerçek HTTP yok)")
    } else if (this.options_.dryRun) {
      this.logger_.warn("[bizimhesap] DRY-RUN — fatura gönderilmez")
    } else {
      this.logger_.info("[bizimhesap] Canlı mod — teslimde fatura kaydı açılır")
    }
  }

  getConnectionStatus(): BizimhesapConnectionStatus {
    return {
      mode: isMockMode(this.options_) ? "mock" : "live",
      baseUrl: this.options_.baseUrl,
      dryRun: this.options_.dryRun,
    }
  }

  isDryRun(): boolean {
    return this.options_.dryRun
  }

  getFirmId(): string {
    return this.options_.firmId
  }

  getDefaultVatRate(): number {
    return this.options_.defaultVatRate
  }

  getShippingVatRate(): number {
    return this.options_.shippingVatRate
  }

  async addInvoice(payload: BizimhesapPayload): Promise<BizimhesapInvoiceResult> {
    if (isMockMode(this.options_)) {
      return { guid: `mock-${payload.invoiceNo}`, mock: true }
    }

    let response: Response
    let rawBody: string
    try {
      response = await globalThis.fetch(`${this.options_.baseUrl}/addinvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.options_.timeoutMs),
      })
      rawBody = await response.text()
    } catch (err) {
      throw new BizimhesapError(
        `Bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`,
        false
      )
    }

    return parseAddInvoiceResponse(response.status, rawBody)
  }

  isStockConfigured(): boolean {
    return Boolean(this.options_.token)
  }

  getStockOptions() {
    const o = this.options_
    return {
      warehouseId: o.warehouseId,
      apply: o.stockApply,
      skuField: o.stockSkuField,
      quantityField: o.stockQuantityField,
      locationId: o.stockLocationId,
      maxZeroRatio: o.stockMaxZeroRatio,
    }
  }

  listWarehouses(): Promise<StockRow[]> {
    return this.getRows_("warehouses")
  }

  listProducts(): Promise<StockRow[]> {
    return this.getRows_("products")
  }

  listInventory(warehouseId: string): Promise<StockRow[]> {
    return this.getRows_(`inventory/${encodeURIComponent(warehouseId)}`)
  }

  /** Yalnız okuma; stok uçları hesaba kayıt yazmadığından dry-run'dan etkilenmez. */
  private async getRows_(path: string): Promise<StockRow[]> {
    if (!this.options_.token) {
      throw new BizimhesapError("BIZIMHESAP_TOKEN boş", true)
    }

    let response: Response
    let rawBody: string
    try {
      response = await globalThis.fetch(`${this.options_.baseUrl}/${path}`, {
        method: "GET",
        headers: {
          Key: this.options_.apiKey,
          Token: this.options_.token,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.options_.timeoutMs),
      })
      rawBody = await response.text()
    } catch (err) {
      throw new BizimhesapError(
        `Bağlantı hatası (${path}): ${err instanceof Error ? err.message : String(err)}`,
        false
      )
    }

    if (!response.ok) {
      throw new BizimhesapError(
        `HTTP ${response.status} (${path}): ${rawBody.slice(0, 300)}`,
        response.status < 500
      )
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      throw new BizimhesapError(`Okunamayan yanıt (${path}): ${rawBody.slice(0, 300)}`, false)
    }
    return extractRows(body)
  }
}

export default BizimhesapModuleService
