import type { Logger } from "@medusajs/framework/types"

import { ParasutClient } from "./client"
import {
  isMockMode,
  isParasutDryRun,
  isPlaceholderCredential,
  normalizeOptions,
  type ParasutOptions,
  type ParasutRawOptions,
} from "./options"
import type {
  ParasutCancelResult,
  ParasutConnectionStatus,
  ParasutContactInput,
  ParasutContactResult,
  ParasutFinalizeInput,
  ParasutFinalizeResult,
  ParasutPdfResult,
  ParasutProductInput,
  ParasutProductResult,
  ParasutRefundInvoiceInput,
  ParasutRefundInvoiceResult,
  ParasutSalesInvoiceInput,
  ParasutSalesInvoiceResult,
} from "./types"

type InjectedDependencies = {
  logger: Logger
}

/**
 * Parasut e-fatura / e-arşiv modül servisi.
 * DB model yok — metadata sipariş üzerinde tutulur.
 */
class ParasutModuleService {
  protected readonly logger_: Logger
  protected readonly options_: ParasutOptions
  private client_: ParasutClient | null = null

  constructor(container: InjectedDependencies, options?: ParasutRawOptions) {
    this.logger_ = container.logger
    this.options_ = normalizeOptions(options ?? {})

    if (isMockMode(this.options_)) {
      this.logger_.info(
        "[parasut] Credentials missing/placeholder — mock mode (no real HTTP)"
      )
    } else {
      this.logger_.info(
        `[parasut] Live mode ready — company=${this.options_.companyId} env=${this.options_.env}`
      )
    }
    if (this.options_.dryRun || isParasutDryRun(this.options_)) {
      this.logger_.warn(
        "[parasut] DRY-RUN ON — taslak sales invoice oluşur; finalize/e-belge ASLA çağrılmaz"
      )
      this.logger_.warn(
        `[parasut] DRY-RUN product create=${this.options_.productCreate ? "AÇIK (PARASUT_PRODUCT_CREATE)" : "kapalı — yalnızca mevcut ürünler aranır"}`
      )
    }
  }

  static validateOptions(options: Record<string, unknown>) {
    for (const key of [
      "clientId",
      "clientSecret",
      "username",
      "password",
      "companyId",
    ] as const) {
      if (isPlaceholderCredential(options[key] as string)) {
        console.warn(
          `[parasut] Missing/placeholder "${key}". Mock mode until PARASUT_* env is set.`
        )
      }
    }
  }

  getOptions(): ParasutOptions {
    return this.options_
  }

  getConnectionStatus(): ParasutConnectionStatus {
    const mock = isMockMode(this.options_)
    return {
      mode: mock ? "mock" : "live",
      env: this.options_.env,
      clientIdConfigured: !isPlaceholderCredential(this.options_.clientId),
      companyIdConfigured: !isPlaceholderCredential(this.options_.companyId),
      baseUrl: this.options_.baseUrl,
      oauthUrl: this.options_.oauthUrl,
      dryRun: this.options_.dryRun || isParasutDryRun(this.options_),
    }
  }

  isDryRun(): boolean {
    return this.options_.dryRun || isParasutDryRun(this.options_)
  }

  getDefaultVatRate(): number {
    return this.options_.defaultVatRate
  }

  /** Kargo kalemi KDV % — PARASUT_SHIPPING_VAT_RATE, default 20. */
  getShippingVatRate(): number {
    return this.options_.shippingVatRate
  }

  getClient(): ParasutClient {
    if (!this.client_) {
      this.client_ = new ParasutClient({
        ...this.options_,
        logger: this.logger_,
      })
    }
    return this.client_
  }

  /**
   * Smoke / derin test: client'ı mock-fail veya sayaçlı instance ile değiştir.
   * Prod akışında çağrılmamalı.
   */
  replaceClientForTests(client: ParasutClient | null) {
    this.client_ = client
  }

  async ensureContact(input: ParasutContactInput): Promise<ParasutContactResult> {
    return this.getClient().ensureContact(input)
  }

  async ensureProduct(
    input: ParasutProductInput
  ): Promise<ParasutProductResult | null> {
    return this.getClient().ensureProduct(input)
  }

  async createSalesInvoice(
    input: ParasutSalesInvoiceInput
  ): Promise<ParasutSalesInvoiceResult> {
    return this.getClient().createSalesInvoice(input)
  }

  async finalizeInvoice(
    input: ParasutFinalizeInput
  ): Promise<ParasutFinalizeResult> {
    if (this.isDryRun()) {
      this.logger_.error(
        `[parasut] DRY-RUN: service.finalizeInvoice BLOCKED invoice=${input.invoiceId}`
      )
      throw new Error(
        "DRY-RUN: finalizeInvoice blocked — no e_archive/e_invoice formalization"
      )
    }
    return this.getClient().finalizeInvoice(input)
  }

  async getInvoicePdf(invoiceId: string): Promise<ParasutPdfResult> {
    return this.getClient().getInvoicePdf(invoiceId)
  }

  async cancelInvoice(invoiceId: string): Promise<ParasutCancelResult> {
    return this.getClient().cancelInvoice(invoiceId)
  }

  async createRefundInvoice(
    input: ParasutRefundInvoiceInput
  ): Promise<ParasutRefundInvoiceResult> {
    if (this.isDryRun()) {
      this.logger_.error(
        `[parasut] DRY-RUN: service.createRefundInvoice BLOCKED return=${input.returnId}`
      )
      throw new Error(
        "DRY-RUN: createRefundInvoice blocked — no refund formalization"
      )
    }
    return this.getClient().createRefundInvoice(input)
  }
}

export default ParasutModuleService
