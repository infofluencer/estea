/**
 * Parasut API v4 HTTP istemcisi.
 *
 * - OAuth2 password grant + refresh_token (canlı mod)
 * - Retry/backoff iskeleti (429 / 5xx)
 * - mockMode: gerçek HTTP yok, mock.ts yanıtları
 *
 * Canlı endpoint yolları iskelet; kimlik gelince "fişi tak" ile devreye girer.
 * Env boşken asla HTTP atılmaz.
 */

import {
  mockCancelInvoice,
  mockCreateRefundInvoice,
  mockCreateSalesInvoice,
  mockEnsureContact,
  mockFinalizeInvoice,
  mockGetInvoicePdf,
  resolveMockInvoiceType,
} from "./mock"
import {
  isMockMode,
  isParasutDryRun,
  toParasutCurrency,
  type ParasutOptions,
} from "./options"
import {
  buildSalesInvoicePayload,
  type ParasutSalesInvoicePayload,
} from "./payload"
import type {
  ParasutCancelResult,
  ParasutContactInput,
  ParasutContactResult,
  ParasutFinalizeInput,
  ParasutFinalizeResult,
  ParasutInvoiceLineInput,
  ParasutPdfResult,
  ParasutProductInput,
  ParasutProductRecord,
  ParasutProductResult,
  ParasutRefundInvoiceInput,
  ParasutRefundInvoiceResult,
  ParasutSalesInvoiceInput,
  ParasutSalesInvoiceResult,
} from "./types"

export type ParasutTransport = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    body?: string
    signal?: AbortSignal
  }
) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
}>

/** Smoke / unit: mock yolda belirli adımı zorla kır. */
export type ParasutMockBehavior = {
  failOn?:
    | "ensureContact"
    | "createSalesInvoice"
    | "finalizeInvoice"
    | "createRefundInvoice"
    | "checkVkn"
    | "getInvoicePdf"
  failMessage?: string
  /** checkVkn fail → canlıda e_archive fallback; mock'ta da aynı davranış */
  checkVknFallbackArchive?: boolean
}

export type ParasutClientOptions = ParasutOptions & {
  transport?: ParasutTransport
  forceMock?: boolean
  mockBehavior?: ParasutMockBehavior
  logger?: {
    info: (m: string) => void
    warn: (m: string) => void
    error: (m: string) => void
  }
}

const ERROR_BODY_LOG_MAX = 4000
const ERROR_BODY_MESSAGE_MAX = 1500

/** Parasut 4xx/5xx JSON/text gövdesini log + error.message için düz metin yap. */
export function formatParasutErrorBody(
  body: unknown,
  max = ERROR_BODY_LOG_MAX
): string {
  if (body == null || body === "") return ""
  let text: string
  if (typeof body === "string") {
    text = body
  } else {
    try {
      text = JSON.stringify(body)
    } catch {
      text = String(body)
    }
  }
  if (text.length <= max) return text
  return `${text.slice(0, max)}…[truncated ${text.length - max} chars]`
}

export class ParasutError extends Error {
  status?: number
  responseBody?: unknown
  retryable?: boolean

  constructor(
    message: string,
    options?: { status?: number; responseBody?: unknown; retryable?: boolean }
  ) {
    super(message)
    this.name = "ParasutError"
    this.status = options?.status
    this.responseBody = options?.responseBody
    this.retryable = options?.retryable
  }
}

type TokenState = {
  accessToken: string
  refreshToken?: string
  expiresAt: number
}

const RETRYABLE = (status: number) => status === 429 || status >= 500

/** 429 gövdesindeki "Try again in N seconds." → bekleme (ms), en fazla 30 sn. */
export function retryAfterMs(err: ParasutError): number | null {
  if (err.status !== 429) return null
  const m = /try again in (\d+)\s*second/i.exec(formatParasutErrorBody(err.responseBody))
  if (!m) return null
  return Math.min(Number(m[1]) * 1000 + 250, 30000)
}

export class ParasutClient {
  readonly baseUrl: string
  readonly oauthUrl: string
  readonly mockMode: boolean
  readonly companyId: string

  private readonly clientId: string
  private readonly clientSecret: string
  private readonly username: string
  private readonly password: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly dryRun: boolean
  private readonly productCreate: boolean
  private readonly shippingProductId: string
  private readonly shippingProductCode: string
  private readonly transport: ParasutTransport
  private readonly logger?: ParasutClientOptions["logger"]
  private mockBehavior_: ParasutMockBehavior
  private token_: TokenState | null = null
  private readonly productCache_ = new Map<string, string>()

  /** Son oluşturulan sales invoice payload (mock + live inspection). */
  lastSalesInvoicePayload: ParasutSalesInvoicePayload | null = null
  lastSalesInvoiceInput: ParasutSalesInvoiceInput | null = null
  /** Çağrı sayaçları — çift fatura / retry smoke için */
  createSalesInvoiceCalls = 0
  finalizeInvoiceCalls = 0
  createRefundInvoiceCalls = 0
  createProductCalls = 0
  requestAttempts = 0

  constructor(options: ParasutClientOptions) {
    this.clientId = options.clientId
    this.clientSecret = options.clientSecret
    this.username = options.username
    this.password = options.password
    this.companyId = options.companyId
    this.baseUrl = options.baseUrl.replace(/\/$/, "")
    this.oauthUrl = options.oauthUrl.replace(/\/$/, "")
    this.timeoutMs = options.timeoutMs
    this.maxRetries = options.maxRetries
    this.dryRun = isParasutDryRun(options)
    this.productCreate = options.productCreate ?? !this.dryRun
    this.shippingProductId = options.shippingProductId || ""
    this.shippingProductCode = options.shippingProductCode || "KARGO"
    this.mockMode = options.forceMock === true || isMockMode(options)
    this.logger = options.logger
    this.mockBehavior_ = options.mockBehavior || {}

    const transport =
      options.transport ?? (globalThis.fetch as unknown as ParasutTransport)
    if (!this.mockMode && !transport) {
      throw new ParasutError(
        "fetch bulunamadı. Node 18+ gerekli veya options.transport verin."
      )
    }
    this.transport = transport
  }

  setMockBehavior(behavior: ParasutMockBehavior) {
    this.mockBehavior_ = behavior || {}
  }

  private throwIfMockFail(step: NonNullable<ParasutMockBehavior["failOn"]>) {
    if (!this.mockMode || this.mockBehavior_.failOn !== step) return
    throw new ParasutError(
      this.mockBehavior_.failMessage ||
        `Parasut mock forced failure: ${step}`,
      { status: 500, retryable: false }
    )
  }

  async ensureContact(input: ParasutContactInput): Promise<ParasutContactResult> {
    if (this.mockMode) {
      this.throwIfMockFail("ensureContact")
      this.logger?.info("[parasut] mock ensureContact")
      return mockEnsureContact(input)
    }

    // Canlı: e-posta / vergi no ile ara; yoksa oluştur.
    // İskelet — kimlik gelince doldurulacak.
    const q = input.email || input.taxNumber
    if (q) {
      const found = await this.requestJson<{
        data?: { id?: string }[]
      }>(
        "GET",
        `/${this.companyId}/contacts?filter[email]=${encodeURIComponent(input.email || "")}`,
        undefined,
        { allowEmpty: true }
      )
      const existing = found?.data?.[0]?.id
      if (existing) {
        return { contactId: String(existing), created: false }
      }
    }

    const created = await this.requestJson<{ data?: { id?: string } }>(
      "POST",
      `/${this.companyId}/contacts`,
      {
        data: {
          type: "contacts",
          attributes: {
            name: input.name,
            email: input.email || undefined,
            tax_number: input.taxNumber || undefined,
            tax_office: input.taxOffice || undefined,
            phone: input.phone || undefined,
            city: input.city || undefined,
            district: input.district || undefined,
            address: input.address || undefined,
            account_type: "customer",
          },
        },
      }
    )
    const id = created?.data?.id
    if (!id) {
      throw new ParasutError("Parasut contact create: missing id", {
        responseBody: created,
      })
    }
    return { contactId: String(id), created: true }
  }

  async createSalesInvoice(
    input: ParasutSalesInvoiceInput
  ): Promise<ParasutSalesInvoiceResult> {
    this.createSalesInvoiceCalls += 1
    const body = buildSalesInvoicePayload(input)
    this.lastSalesInvoiceInput = input
    this.lastSalesInvoicePayload = body

    if (this.mockMode) {
      this.throwIfMockFail("createSalesInvoice")
      this.logger?.info(
        `[parasut] mock createSalesInvoice order=${input.orderId}`
      )
      return mockCreateSalesInvoice(input)
    }

    const withProducts = await this.attachProducts(input)
    const liveBody = buildSalesInvoicePayload(withProducts)
    this.lastSalesInvoiceInput = withProducts
    this.lastSalesInvoicePayload = liveBody

    const created = await this.requestJson<{ data?: { id?: string } }>(
      "POST",
      `/${this.companyId}/sales_invoices`,
      liveBody
    )
    const id = created?.data?.id
    if (!id) {
      throw new ParasutError("Parasut sales invoice create: missing id", {
        responseBody: created,
      })
    }
    return { invoiceId: String(id) }
  }

  /**
   * Parasut ürün/hizmet: önce code (SKU), code yoksa name ile birebir arar.
   * Bulunamazsa productCreate açıksa oluşturur; kapalıysa null döner.
   */
  async ensureProduct(
    input: ParasutProductInput
  ): Promise<ParasutProductResult | null> {
    const code = (input.code || "").trim()
    const name = (input.name || "").trim() || code
    const cacheKey = code ? `code:${code}` : `name:${name.toLowerCase()}`

    if (this.mockMode) {
      return {
        productId: `mock-product-${code || name}`.replace(/\s+/g, "-"),
        created: false,
        mock: true,
      }
    }

    const cached = this.productCache_.get(cacheKey)
    if (cached) return { productId: cached, created: false }

    const filter = code
      ? `filter[code]=${encodeURIComponent(code)}`
      : `filter[name]=${encodeURIComponent(name)}`
    const found = await this.requestJson<{
      data?: { id?: string; attributes?: { code?: string | null; name?: string | null } }[]
    }>(
      "GET",
      `/${this.companyId}/products?${filter}&page[size]=25`,
      undefined,
      { allowEmpty: true }
    )
    const match = (found?.data || []).find((p) => {
      const a = p.attributes || {}
      return code
        ? (a.code || "").trim() === code
        : (a.name || "").trim().toLowerCase() === name.toLowerCase()
    })
    if (match?.id) {
      this.productCache_.set(cacheKey, String(match.id))
      return { productId: String(match.id), created: false }
    }

    if (!this.productCreate) return null

    this.createProductCalls += 1
    this.logger?.warn(
      `[parasut] product create code=${code || "-"} name=${name}${this.dryRun ? " (DRY-RUN, PARASUT_PRODUCT_CREATE açık)" : ""}`
    )
    const created = await this.requestJson<{ data?: { id?: string } }>(
      "POST",
      `/${this.companyId}/products`,
      {
        data: {
          type: "products",
          attributes: {
            name,
            code: code || undefined,
            vat_rate: input.vatRate,
            list_price: input.listPrice,
            currency: "TRL",
            inventory_tracking: false,
          },
        },
      }
    )
    const id = created?.data?.id
    if (!id) {
      throw new ParasutError("Parasut product create: missing id", {
        responseBody: created,
      })
    }
    this.productCache_.set(cacheKey, String(id))
    return { productId: String(id), created: true }
  }

  /** Salt okuma: ürün listesi tek sayfa (Parasut page[size] en fazla 25). */
  async listProductsPage(
    pageNumber: number,
    pageSize = 25
  ): Promise<{
    products: ParasutProductRecord[]
    totalPages: number
    totalCount: number
  }> {
    if (this.mockMode) {
      return { products: [], totalPages: 0, totalCount: 0 }
    }
    const size = Math.min(Math.max(1, pageSize), 25)
    const res = await this.requestJson<{
      data?: { id?: string; attributes?: Record<string, unknown> }[]
      meta?: { total_pages?: number; total_count?: number }
    }>(
      "GET",
      `/${this.companyId}/products?page[number]=${pageNumber}&page[size]=${size}&sort=id`,
      undefined,
      { allowEmpty: true }
    )
    const products = (res?.data || [])
      .filter((p) => p.id)
      .map((p) => {
        const a = p.attributes || {}
        const str = (v: unknown) =>
          v == null || v === "" ? null : String(v).trim() || null
        const num = (v: unknown) => {
          const n = Number(v)
          return v == null || v === "" || !Number.isFinite(n) ? null : n
        }
        return {
          id: String(p.id),
          name: str(a.name) || "",
          code: str(a.code),
          barcode: str(a.barcode),
          vatRate: num(a.vat_rate),
          listPrice: num(a.list_price),
          currency: str(a.currency),
          archived: a.archived === true,
          inventoryTracking: a.inventory_tracking === true,
          salesInvoiceDetailsCount: num(a.sales_invoice_details_count),
        }
      })
    return {
      products,
      totalPages: Number(res?.meta?.total_pages) || 0,
      totalCount: Number(res?.meta?.total_count) || products.length,
    }
  }

  /** Her kalemi (ve kargoyu) Parasut ürününe bağlar; eksik varsa fatura POST edilmeden hata. */
  private async attachProducts(
    input: ParasutSalesInvoiceInput
  ): Promise<ParasutSalesInvoiceInput> {
    const missing: string[] = []

    const lines: ParasutInvoiceLineInput[] = []
    for (const line of input.lines) {
      if (line.productId) {
        lines.push(line)
        continue
      }
      const product = await this.ensureProduct({
        code: line.productCode,
        name: line.description,
        vatRate: line.vatRate,
        listPrice: line.unitPrice,
      })
      if (!product) missing.push(line.productCode || line.description)
      lines.push({ ...line, productId: product?.productId ?? null })
    }

    let shipping = input.shipping
    if (shipping && shipping.amount > 0 && !shipping.productId) {
      if (this.shippingProductId) {
        shipping = { ...shipping, productId: this.shippingProductId }
      } else {
        const product = await this.ensureProduct({
          code: this.shippingProductCode,
          name: shipping.description || "Kargo",
          vatRate: shipping.vatRate,
          listPrice: shipping.amount,
        })
        if (!product) missing.push(this.shippingProductCode)
        shipping = { ...shipping, productId: product?.productId ?? null }
      }
    }

    const resolved = { ...input, lines, shipping }
    if (missing.length) {
      this.lastSalesInvoiceInput = resolved
      this.lastSalesInvoicePayload = buildSalesInvoicePayload(resolved)
      throw new ParasutError(
        `Parasut ürün/hizmet bulunamadı (oluşturma kapalı${this.dryRun ? ", DRY-RUN" : ""}): ${missing.join(", ")}. Parasut'ta bu kodla ürün açın, PARASUT_SHIPPING_PRODUCT_ID verin veya PARASUT_PRODUCT_CREATE=true.`,
        { retryable: false }
      )
    }
    return resolved
  }

  /**
   * DRY-RUN: resmileştirme (e_archives / e_invoices / iade) YASAK.
   * Env veya options.dryRun — çağrılsa bile HTTP atılmaz.
   */
  private assertFormalizationAllowed(step: string): void {
    if (!this.dryRun && !isParasutDryRun()) return
    this.logger?.error(
      `[parasut] DRY-RUN: ${step} BLOCKED — e_archive/e_invoice/refund POST yok invoice/order guard`
    )
    throw new ParasutError(
      `DRY-RUN: ${step} blocked — no e_archive/e_invoice formalization`,
      { retryable: false }
    )
  }

  /**
   * VKN e-fatura mükellefi mi → e_invoice, değilse e_archive.
   */
  async finalizeInvoice(
    input: ParasutFinalizeInput
  ): Promise<ParasutFinalizeResult> {
    // GÜVENLİK: DRY-RUN'da ilk satır — GİB/e-belge POST yok
    this.assertFormalizationAllowed("finalizeInvoice")
    this.finalizeInvoiceCalls += 1
    if (this.mockMode) {
      this.throwIfMockFail("finalizeInvoice")
      this.logger?.info(
        `[parasut] mock finalizeInvoice invoice=${input.invoiceId}`
      )
      return mockFinalizeInvoice(input)
    }

    const invoiceType = await this.checkVknType(input.taxNumber)
    const endpoint =
      invoiceType === "e_invoice"
        ? `/${this.companyId}/e_invoices`
        : `/${this.companyId}/e_archives`

    const body: {
      data: {
        type: string
        attributes?: {
          internet_sale?: {
            url: string
            payment_type: string
            payment_platform: string
            payment_date: string
          }
        }
        relationships: {
          sales_invoice: {
            data: { type: string; id: string }
          }
        }
      }
    } = {
      data: {
        type: invoiceType === "e_invoice" ? "e_invoices" : "e_archives",
        relationships: {
          sales_invoice: {
            data: { type: "sales_invoices", id: input.invoiceId },
          },
        },
      },
    }

    // e-Arşiv: GİB internet satışı zorunlu (e-ticaret)
    if (invoiceType === "e_archive" && input.internetSale) {
      body.data.attributes = {
        internet_sale: {
          url: input.internetSale.url,
          payment_type: input.internetSale.payment_type,
          payment_platform: input.internetSale.payment_platform,
          payment_date: input.internetSale.payment_date,
        },
      }
    }

    const created = await this.requestJson<{
      data?: {
        id?: string
        attributes?: { invoice_no?: string; uuid?: string }
      }
    }>("POST", endpoint, body)

    const formalId = created?.data?.id
    if (!formalId) {
      throw new ParasutError("Parasut finalize: missing formal id", {
        responseBody: created,
      })
    }

    return {
      invoiceId: input.invoiceId,
      formalId: String(formalId),
      invoiceType,
      invoiceNumber:
        created?.data?.attributes?.invoice_no ||
        `${invoiceType}-${formalId}`,
      uuid: created?.data?.attributes?.uuid,
    }
  }

  async getInvoicePdf(invoiceId: string): Promise<ParasutPdfResult> {
    if (this.mockMode) {
      this.throwIfMockFail("getInvoicePdf")
      this.logger?.info(`[parasut] mock getInvoicePdf invoice=${invoiceId}`)
      return mockGetInvoicePdf(invoiceId)
    }

    // PDF URL genelde e_archive / e_invoice show yanıtında gelir — iskelet.
    const res = await this.requestJson<{
      data?: { attributes?: { pdf_url?: string; url?: string } }
    }>("GET", `/${this.companyId}/sales_invoices/${invoiceId}`)

    const pdfUrl =
      res?.data?.attributes?.pdf_url || res?.data?.attributes?.url || ""
    if (!pdfUrl) {
      throw new ParasutError("Parasut PDF URL missing", { responseBody: res })
    }
    return { invoiceId, pdfUrl }
  }

  async cancelInvoice(invoiceId: string): Promise<ParasutCancelResult> {
    if (this.mockMode) {
      this.logger?.info(`[parasut] mock cancelInvoice invoice=${invoiceId}`)
      return mockCancelInvoice(invoiceId)
    }

    await this.requestJson(
      "DELETE",
      `/${this.companyId}/sales_invoices/${invoiceId}`
    )
    return { invoiceId, canceled: true }
  }

  async createRefundInvoice(
    input: ParasutRefundInvoiceInput
  ): Promise<ParasutRefundInvoiceResult> {
    // GÜVENLİK: DRY-RUN'da iade faturası da resmileşmez
    this.assertFormalizationAllowed("createRefundInvoice")
    this.createRefundInvoiceCalls += 1
    if (this.mockMode) {
      this.throwIfMockFail("createRefundInvoice")
      this.logger?.info(
        `[parasut] mock createRefundInvoice return=${input.returnId}`
      )
      return mockCreateRefundInvoice(input)
    }

    // Canlı: satış faturasına bağlı iade / credit note — iskelet.
    const created = await this.requestJson<{
      data?: {
        id?: string
        attributes?: { invoice_no?: string }
      }
    }>("POST", `/${this.companyId}/sales_invoices`, {
      data: {
        type: "sales_invoices",
        attributes: {
          item_type: "refund",
          description:
            input.description ||
            `Es Çay iade ${input.returnId} (sipariş ${input.orderId})`,
          issue_date: new Date().toISOString().slice(0, 10),
          currency: toParasutCurrency(input.currencyCode),
        },
        relationships: {
          linked_invoice: {
            data: { type: "sales_invoices", id: input.originalInvoiceId },
          },
        },
      },
    })

    const id = created?.data?.id
    if (!id) {
      throw new ParasutError("Parasut refund invoice: missing id", {
        responseBody: created,
      })
    }

    return {
      refundInvoiceId: String(id),
      invoiceNumber:
        created?.data?.attributes?.invoice_no || `REF-${id}`,
      invoiceType: "e_archive",
      amount: input.amount,
    }
  }

  /** VKN e-fatura inbox'ta kayıtlı mı? */
  async checkVknType(
    taxNumber?: string | null
  ): Promise<"e_archive" | "e_invoice"> {
    if (this.mockMode) {
      if (this.mockBehavior_.failOn === "checkVkn") {
        this.logger?.warn(
          "[parasut] mock checkVkn forced fail — fallback e_archive"
        )
        return "e_archive"
      }
      // Mock simülasyon: 10 haneli + "9" ile başlayan → e_invoice (kayıtlı);
      // diğer VKN / TCKN / yok → e_archive (kayıtsız).
      return resolveMockInvoiceType(taxNumber)
    }

    const digits = (taxNumber || "").replace(/\D/g, "")
    if (digits.length !== 10) {
      return "e_archive"
    }

    try {
      const res = await this.requestJson<{ data?: unknown[] }>(
        "GET",
        `/${this.companyId}/e_invoice_inboxes?filter[vkn]=${encodeURIComponent(digits)}`,
        undefined,
        { allowEmpty: true }
      )
      if (Array.isArray(res?.data) && res.data.length > 0) {
        return "e_invoice"
      }
    } catch (err) {
      this.logger?.warn(
        `[parasut] checkVknType failed — fallback e_archive: ${String(err)}`
      )
    }
    return "e_archive"
  }

  // --- OAuth + HTTP ---

  private async ensureAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.token_ && this.token_.expiresAt > now + 30_000) {
      return this.token_.accessToken
    }

    if (this.token_?.refreshToken) {
      try {
        await this.fetchToken({
          grant_type: "refresh_token",
          refresh_token: this.token_.refreshToken,
        })
        return this.token_!.accessToken
      } catch (err) {
        this.logger?.warn(
          `[parasut] refresh_token failed — password grant fallback: ${String(err)}`
        )
      }
    }

    await this.fetchToken({
      grant_type: "password",
      username: this.username,
      password: this.password,
    })
    return this.token_!.accessToken
  }

  private async fetchToken(params: Record<string, string>): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      ...params,
    })

    const url = `${this.oauthUrl}/oauth/token`
    const res = await this.transport(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    })
    const text = await res.text()
    let json: {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      error?: string
    } = {}
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      const bodyText = formatParasutErrorBody(text)
      this.logger?.error(
        `Parasut OAuth non-JSON ${res.status} body=${bodyText || "(empty)"}`
      )
      throw new ParasutError(
        `OAuth non-JSON (${res.status})${bodyText ? ` ${formatParasutErrorBody(text, ERROR_BODY_MESSAGE_MAX)}` : ""}`,
        {
          status: res.status,
          responseBody: text,
        }
      )
    }
    if (!res.ok || !json.access_token) {
      const rawBody = json
      const bodyText = formatParasutErrorBody(rawBody)
      this.logger?.error(
        `Parasut OAuth HTTP ${res.status} body=${bodyText || "(empty)"}`
      )
      throw new ParasutError(
        `OAuth failed: ${json.error || res.status}${
          bodyText ? ` ${formatParasutErrorBody(rawBody, ERROR_BODY_MESSAGE_MAX)}` : ""
        }`,
        { status: res.status, responseBody: json, retryable: RETRYABLE(res.status) }
      )
    }
    this.token_ = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (Number(json.expires_in) || 7200) * 1000,
    }
  }

  private async requestJson<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { allowEmpty?: boolean }
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.requestAttempts += 1
      try {
        const token = await this.ensureAccessToken()
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
          const res = await this.transport(`${this.baseUrl}${path}`, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          })
          const text = await res.text()
          let json: T | null = null
          if (text) {
            try {
              json = JSON.parse(text) as T
            } catch {
              const bodyText = formatParasutErrorBody(text)
              this.logger?.error(
                `Parasut HTTP ${res.status} ${method} ${path} non-JSON body=${bodyText || "(empty)"}`
              )
              throw new ParasutError(
                `Non-JSON response (${res.status}) ${method} ${path}${
                  bodyText ? ` ${formatParasutErrorBody(text, ERROR_BODY_MESSAGE_MAX)}` : ""
                }`,
                {
                  status: res.status,
                  responseBody: text,
                }
              )
            }
          }
          if (!res.ok) {
            const rawBody = json ?? text
            const bodyText = formatParasutErrorBody(rawBody)
            this.logger?.error(
              `Parasut HTTP ${res.status} ${method} ${path} body=${bodyText || "(empty)"}`
            )
            throw new ParasutError(
              `Parasut HTTP ${res.status} ${method} ${path}${
                bodyText
                  ? ` ${formatParasutErrorBody(rawBody, ERROR_BODY_MESSAGE_MAX)}`
                  : ""
              }`,
              {
                status: res.status,
                responseBody: rawBody,
                retryable: RETRYABLE(res.status),
              }
            )
          }
          if (json == null && !opts?.allowEmpty) {
            throw new ParasutError(`Empty response ${method} ${path}`, {
              status: res.status,
            })
          }
          return (json ?? ({} as T)) as T
        } finally {
          clearTimeout(timer)
        }
      } catch (err) {
        lastError = err
        const retryable =
          err instanceof ParasutError
            ? Boolean(err.retryable)
            : err instanceof Error && err.name === "AbortError"
        if (!retryable || attempt >= this.maxRetries) {
          throw err
        }
        const hinted = err instanceof ParasutError ? retryAfterMs(err) : null
        const delay = Math.max(Math.min(1000 * 2 ** attempt, 8000), hinted ?? 0)
        this.logger?.warn(
          `[parasut] retry ${attempt + 1}/${this.maxRetries} after ${delay}ms — ${String(err)}`
        )
        await sleep(delay)
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new ParasutError(String(lastError))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
