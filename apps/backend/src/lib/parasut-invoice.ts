/**
 * Satış faturası: order → contact → sales invoice → e_archive/e_invoice → metadata.
 * Idempotent: metadata.parasut_invoice.status === "issued" ise skip.
 *
 * Tutarlar: Medusa KDV dahil (tax-inclusive) → Parasut unit_price KDV hariç.
 * Parasut major-unit TL (×100 YOK).
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import {
  PARASUT_MODULE,
  isParasutDryRun,
  type ParasutOrderInvoiceMeta,
} from "../modules/parasut"
import {
  ParasutError,
  formatParasutErrorBody,
} from "../modules/parasut/client"
import ParasutModuleService from "../modules/parasut/service"
import type {
  ParasutInternetSale,
  ParasutInvoiceLineInput,
} from "../modules/parasut/types"
import { isBankTransferOrder } from "./bank-transfer"
import { sendInvoiceIssuedEmail } from "./parasut-invoice-email"
import { parasutProductIdFromMetadata } from "./parasut-mapping-apply"
import { notifyParasutInvoiceFailure } from "./parasut-invoice-admin-notify"

export type IssueSalesInvoiceResult = {
  ok: boolean
  skipped?: boolean
  meta: ParasutOrderInvoiceMeta
}

export type IssueSalesInvoiceOptions = {
  /** Yalnızca DRY-RUN: mevcut metadata.parasut_invoice yok sayılır, taze taslak. Finalize yok. */
  forceFreshDraft?: boolean
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value != null && typeof value === "object" && "value" in value) {
    return asNumber((value as { value: unknown }).value)
  }
  if (
    value != null &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const n = Number(String(value))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Medusa major-unit → Parasut (aynı major unit, 2 ondalık). ×100 YOK. */
export function toParasutAmount(value: unknown): number {
  return roundMoney(asNumber(value))
}

/**
 * KDV dahil brüt → KDV hariç net.
 * net = brüt / (1 + vatRate/100)
 */
export function grossToNet(gross: number, vatRatePercent: number): number {
  const g = asNumber(gross)
  const r = asNumber(vatRatePercent)
  if (g === 0) return 0
  if (r <= 0) return roundMoney(g)
  return roundMoney(g / (1 + r / 100))
}

/** KDV hariç net → KDV dahil brüt (doğrulama). */
export function netToGross(net: number, vatRatePercent: number): number {
  const n = asNumber(net)
  const r = asNumber(vatRatePercent)
  if (n === 0) return 0
  if (r <= 0) return roundMoney(n)
  return roundMoney(n * (1 + r / 100))
}

/**
 * Checkout billing_address.metadata anahtarlarıyla birebir:
 * tax_number | vkn | tckn | identity_number
 */
function extractTaxNumber(
  meta: Record<string, unknown> | null | undefined,
  addressMeta?: Record<string, unknown> | null
): string | null {
  const candidates = [
    meta?.tax_number,
    meta?.vkn,
    meta?.tckn,
    meta?.identity_number,
    addressMeta?.tax_number,
    addressMeta?.vkn,
    addressMeta?.tckn,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.replace(/\D/g, "").length >= 10) {
      return c.replace(/\D/g, "")
    }
  }
  return null
}

function metaString(
  ...sources: (Record<string, unknown> | null | undefined)[]
): (key: string) => string | null {
  return (key: string) => {
    for (const src of sources) {
      const v = src?.[key]
      if (typeof v === "string" && v.trim()) return v.trim()
    }
    return null
  }
}

function lineDiscountAmount(item: {
  discount_total?: unknown
  adjustments?: { amount?: unknown }[] | null
}): number {
  const fromTotal = toParasutAmount(item.discount_total)
  if (fromTotal > 0) return fromTotal
  const fromAdj = (item.adjustments || []).reduce((s, a) => {
    const n = toParasutAmount(a.amount)
    return s + Math.abs(n)
  }, 0)
  return roundMoney(fromAdj)
}

/** Medusa tax_lines.rate → Parasut vat_rate (%). 0.1 → 10, 10 → 10, 0.2 → 20. */
export function mapMedusaTaxRateToParasutVat(
  rate: unknown,
  fallback: number
): number {
  const r = asNumber(rate)
  if (r > 0) {
    return r <= 1 ? roundMoney(r * 100) : r
  }
  return fallback
}

function lineVatRate(
  item: {
    tax_lines?: { rate?: unknown }[] | null
  },
  fallback: number
): number {
  return mapMedusaTaxRateToParasutVat(item.tax_lines?.[0]?.rate, fallback)
}

/**
 * Parasut satırlarından tahmini KDV dahil toplam.
 * Kalem: (net_unit - net_discount) * qty * (1+vat) + kargo − fatura indirimi
 */
export function estimateGrossFromParasutLines(input: {
  lines: ParasutInvoiceLineInput[]
  shipping?: { amount: number; vatRate: number } | null
  orderDiscountNet?: number | null
  orderDiscountVatRate?: number
}): number {
  let sum = 0
  for (const line of input.lines) {
    const disc = line.discountValue || 0
    const netLine = (line.unitPrice - disc) * line.quantity
    sum += netToGross(netLine, line.vatRate)
  }
  if (input.shipping && input.shipping.amount > 0) {
    sum += netToGross(input.shipping.amount, input.shipping.vatRate)
  }
  const residualNet = asNumber(input.orderDiscountNet)
  if (residualNet > 0) {
    const vat = input.orderDiscountVatRate ?? 10
    sum -= netToGross(residualNet, vat)
  }
  return roundMoney(sum)
}

/**
 * Canlı Parasut e-arşiv şablonu ile hizalı:
 *   Ödeme Şekli = KREDIKARTI/BANKAKARTI  (kısa "KREDIKARTI" DEĞİL)
 *   Ödeme Aracısı = PayTR
 * Havale siparişi: Ödeme Şekli = EFT/HAVALE, aracı alanına banka adı.
 * NOT (Faz 2B): send_date / kargo bilgisi ödeme anında henüz yok — gönderilmiyor.
 */
export function buildParasutInternetSale(
  paymentDate = new Date().toISOString().slice(0, 10),
  opts: { bankTransfer?: boolean } = {}
): ParasutInternetSale {
  // Açıkça verilen e-arşiv satış URL'i önce gelir; STOREFRONT_URL geçiş öncesi
  // IP adresi olabilir ve faturaya yanlış site yazılır.
  const rawUrl = (
    process.env.PARASUT_INTERNET_SALE_URL ||
    process.env.STOREFRONT_URL ||
    "https://market.esteacay.com"
  ).replace(/\/$/, "")
  let url = rawUrl
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`)
    url = `${u.protocol}//${u.host}`
  } catch {
    url = "https://market.esteacay.com"
  }
  if (opts.bankTransfer) {
    return {
      url,
      payment_type: "EFT/HAVALE",
      payment_platform: (process.env.BANK_TRANSFER_BANK_NAME || "").trim() || "Banka",
      payment_date: paymentDate,
    }
  }
  return {
    url,
    payment_type: "KREDIKARTI/BANKAKARTI",
    payment_platform: "PayTR",
    payment_date: paymentDate,
  }
}

async function writeOrderInvoiceMeta(
  scope: MedusaContainer,
  orderId: string,
  existingMeta: Record<string, unknown> | null | undefined,
  invoiceMeta: ParasutOrderInvoiceMeta
) {
  const orderModule = scope.resolve(Modules.ORDER)
  await orderModule.updateOrders([
    {
      id: orderId,
      metadata: {
        ...(existingMeta || {}),
        parasut_invoice: invoiceMeta,
      },
    },
  ])
}

/** variant_id → metadata.parasut_product_id (parasut-apply-mapping ile yazılır). */
async function loadVariantParasutProductIds(
  query: { graph: (args: Record<string, unknown>) => Promise<{ data: unknown[] }> },
  variantIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(variantIds.filter(Boolean))]
  if (!ids.length) return out
  const { data } = await query.graph({
    entity: "product_variant",
    fields: ["id", "metadata"],
    filters: { id: ids },
  })
  for (const v of data as { id: string; metadata?: Record<string, unknown> | null }[]) {
    const pid = parasutProductIdFromMetadata(v.metadata)
    if (pid) out.set(v.id, pid)
  }
  return out
}

/**
 * Ödeme yakalandıktan sonra e-arşiv / e-fatura kes.
 * Hata → metadata.status=error + ERROR log (yasal görünürlük).
 */
export async function issueSalesInvoiceForOrder(
  scope: MedusaContainer,
  orderId: string,
  options?: IssueSalesInvoiceOptions
): Promise<IssueSalesInvoiceResult> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "email",
      "currency_code",
      "metadata",
      "total",
      "item_total",
      "discount_total",
      "shipping_total",
      "tax_total",
      "items.id",
      "items.title",
      "items.quantity",
      // Sipariş kalemi adedi order_item'da (detail) durur; yalnız "items.quantity"
      // istenirse Medusa adedi boş döner ve toplamlar 0 hesaplanır.
      "items.detail.quantity",
      "items.unit_price",
      // Olmazsa toplam kontrolü birim fiyatı KDV hariç sanıp KDV'yi iki kez ekler.
      "items.is_tax_inclusive",
      "items.variant_sku",
      "items.variant_id",
      "items.tax_total",
      "items.discount_total",
      "items.tax_lines.rate",
      "items.adjustments.amount",
      "items.adjustments.code",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
      "shipping_address.city",
      "shipping_address.province",
      "shipping_address.address_1",
      "shipping_address.metadata",
      "billing_address.first_name",
      "billing_address.last_name",
      "billing_address.phone",
      "billing_address.city",
      "billing_address.province",
      "billing_address.address_1",
      "billing_address.metadata",
      "customer.id",
      "customer.email",
      "customer.first_name",
      "customer.last_name",
      "customer.metadata",
    ],
    filters: { id: orderId },
  })

  const order = orders?.[0] as
    | {
        id: string
        display_id?: number | string | null
        status?: string | null
        email?: string | null
        currency_code?: string | null
        metadata?: Record<string, unknown> | null
        total?: unknown
        item_total?: unknown
        discount_total?: unknown
        shipping_total?: unknown
        items?: {
          id?: string
          title?: string | null
          quantity?: number | null
          unit_price?: unknown
          variant_sku?: string | null
          variant_id?: string | null
          tax_total?: unknown
          discount_total?: unknown
          tax_lines?: { rate?: unknown }[] | null
          adjustments?: { amount?: unknown; code?: string | null }[] | null
        }[]
        shipping_address?: {
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          city?: string | null
          province?: string | null
          address_1?: string | null
          metadata?: Record<string, unknown> | null
        } | null
        billing_address?: {
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          city?: string | null
          province?: string | null
          address_1?: string | null
          metadata?: Record<string, unknown> | null
        } | null
        customer?: {
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          metadata?: Record<string, unknown> | null
        } | null
      }
    | undefined

  if (!order?.id) {
    const meta: ParasutOrderInvoiceMeta = {
      status: "error",
      mode: "mock",
      error: "Order not found",
      at: new Date().toISOString(),
    }
    logger.error(`[parasut-invoice] Order not found id=${orderId}`)
    return { ok: false, meta }
  }

  const existing = (order.metadata?.parasut_invoice ||
    null) as ParasutOrderInvoiceMeta | null
  const forceFreshDraft =
    options?.forceFreshDraft === true && isParasutDryRun()
  if (options?.forceFreshDraft === true && !isParasutDryRun()) {
    logger.warn(
      `[parasut-invoice] forceFreshDraft yok sayıldı — PARASUT_DRY_RUN kapalı (finalize yolu korunur)`
    )
  }
  if (!forceFreshDraft && existing?.status === "issued" && existing.invoice_id) {
    logger.info(
      `[parasut-invoice] Idempotent skip — order=${orderId} invoice=${existing.invoice_number || existing.invoice_id}`
    )
    return { ok: true, skipped: true, meta: existing }
  }
  if (!forceFreshDraft && existing?.status === "draft_dryrun" && existing.invoice_id) {
    logger.info(
      `[parasut-invoice] DRY-RUN idempotent skip — order=${orderId} draft=${existing.invoice_id} (resmileştirilmedi)`
    )
    return { ok: true, skipped: true, meta: existing }
  }
  if (forceFreshDraft && existing?.invoice_id) {
    logger.info(
      `[parasut-invoice] DRY-RUN forceFreshDraft — order=${orderId} önceki=${existing.status}:${existing.invoice_id} yok sayıldı, taze taslak`
    )
  }

  if (order.status === "canceled") {
    const meta: ParasutOrderInvoiceMeta = {
      status: "skipped",
      mode: existing?.mode || "mock",
      error: "Order canceled",
      at: new Date().toISOString(),
      note: "canceled",
    }
    await writeOrderInvoiceMeta(scope, orderId, order.metadata, meta)
    return { ok: false, skipped: true, meta }
  }

  let parasut: ParasutModuleService
  try {
    parasut = scope.resolve(PARASUT_MODULE) as ParasutModuleService
  } catch (err) {
    const meta: ParasutOrderInvoiceMeta = {
      status: "error",
      mode: "mock",
      error: `Parasut module unavailable: ${String(err)}`,
      at: new Date().toISOString(),
      retry_count: existing?.retry_count,
    }
    logger.error(
      `[parasut-invoice] MODULE MISSING — order=${orderId} (yasal risk): ${meta.error}`
    )
    try {
      await writeOrderInvoiceMeta(scope, orderId, order.metadata, meta)
    } catch {
      /* ignore */
    }
    return { ok: false, meta }
  }

  const conn = parasut.getConnectionStatus()
  const mode = conn.mode
  const vatDefault = parasut.getDefaultVatRate()
  const vatShipping = parasut.getShippingVatRate()
  const displayId =
    formatOrderNumber(order.display_id) ||
    String(order.display_id ?? order.id)

  const addr = order.billing_address || order.shipping_address
  const billMeta = order.billing_address?.metadata || null
  const shipMeta = order.shipping_address?.metadata || null
  const readMeta = metaString(
    order.customer?.metadata || null,
    billMeta,
    shipMeta,
    order.metadata || null
  )

  const taxNumber = extractTaxNumber(
    order.customer?.metadata || null,
    billMeta || order.metadata || null
  )

  const companyName = readMeta("company_name")
  const taxOffice = readMeta("tax_office")
  // Checkout ilçeyi metadata.district yazar (province çoğu boş)
  const district = readMeta("district") || addr?.province || null

  const name =
    companyName ||
    [addr?.first_name, addr?.last_name].filter(Boolean).join(" ").trim() ||
    [order.customer?.first_name, order.customer?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    order.email ||
    order.customer?.email ||
    "Müşteri"

  const internetSale = buildParasutInternetSale(undefined, {
    bankTransfer: isBankTransferOrder(order),
  })
  const dryRun = parasut.isDryRun()

  try {
    // DRY-RUN: pending/error resume bile finalize ETMEZ
    if (
      dryRun &&
      !forceFreshDraft &&
      existing?.invoice_id &&
      (existing.status === "pending" || existing.status === "error")
    ) {
      logger.warn(
        `[parasut-invoice] DRY-RUN: resume finalize ATLANDI order=${orderId} invoice=${existing.invoice_id}`
      )
      const meta: ParasutOrderInvoiceMeta = {
        ...existing,
        status: "draft_dryrun",
        mode,
        note: "dry_run_resume_not_formalized",
        at: new Date().toISOString(),
      }
      await writeOrderInvoiceMeta(scope, orderId, order.metadata, meta)
      return { ok: true, skipped: true, meta }
    }

    // Resume: sales invoice var, formalize kırılmış — yeni fatura AÇMA
    if (
      existing?.invoice_id &&
      (existing.status === "pending" || existing.status === "error")
    ) {
      logger.info(
        `[parasut-invoice] Resume formalize — order=${orderId} invoice=${existing.invoice_id}`
      )
      const formal = await parasut.finalizeInvoice({
        invoiceId: existing.invoice_id,
        taxNumber,
        orderId: order.id,
        internetSale,
      })
      let pdfUrl: string | undefined
      try {
        const pdf = await parasut.getInvoicePdf(existing.invoice_id)
        pdfUrl = pdf.pdfUrl
      } catch (pdfErr) {
        logger.warn(
          `[parasut-invoice] PDF alınamadı order=${orderId}: ${String(pdfErr)}`
        )
      }
      const meta: ParasutOrderInvoiceMeta = {
        status: "issued",
        mode,
        contact_id: existing.contact_id,
        invoice_id: existing.invoice_id,
        formal_id: formal.formalId,
        invoice_number: formal.invoiceNumber,
        invoice_type: formal.invoiceType,
        pdf_url: pdfUrl,
        tax_number: taxNumber,
        at: new Date().toISOString(),
        note: "resumed_after_partial_failure",
        retry_count: existing.retry_count,
      }
      await writeOrderInvoiceMeta(scope, orderId, order.metadata, meta)
      logger.info(
        `[parasut-invoice] Issued (resume) — order=${orderId} no=${meta.invoice_number} type=${meta.invoice_type}`
      )
      try {
        await sendInvoiceIssuedEmail(scope, orderId, meta)
      } catch (mailErr) {
        logger.warn(
          `[parasut-invoice] Invoice email failed order=${orderId}: ${String(mailErr)}`
        )
      }
      return { ok: true, meta }
    }

    const contact = await parasut.ensureContact({
      orderId: order.id,
      name,
      email: order.email || order.customer?.email,
      taxNumber,
      taxOffice,
      phone: addr?.phone,
      city: addr?.city,
      district,
      address: addr?.address_1,
    })

    const variantProductIds = await loadVariantParasutProductIds(
      query as never,
      (order.items || []).map((item) => item.variant_id || "")
    )

    // KDV dahil (Medusa) → KDV hariç (Parasut)
    const lines: ParasutInvoiceLineInput[] = (order.items || []).map((item) => {
      const qty = Math.max(1, asNumber(item.quantity) || 1)
      const vatRate = lineVatRate(item, vatDefault)
      const grossUnit = toParasutAmount(item.unit_price)
      const unit = grossToNet(grossUnit, vatRate)
      const lineDiscountGross = lineDiscountAmount(item)
      const discountValue =
        lineDiscountGross > 0
          ? grossToNet(roundMoney(lineDiscountGross / qty), vatRate)
          : undefined
      return {
        description: item.title || item.variant_sku || "Ürün",
        quantity: qty,
        unitPrice: unit,
        vatRate,
        discountValue,
        productCode: item.variant_sku,
        productId: item.variant_id
          ? variantProductIds.get(item.variant_id) ?? null
          : null,
      }
    })

    const itemsDiscountSumGross = roundMoney(
      (order.items || []).reduce((s, item) => s + lineDiscountAmount(item), 0)
    )
    const orderDiscountRawGross = toParasutAmount(order.discount_total)
    const residualOrderDiscountGross = roundMoney(
      Math.max(0, orderDiscountRawGross - itemsDiscountSumGross)
    )
    const residualOrderDiscountNet =
      residualOrderDiscountGross > 0
        ? grossToNet(residualOrderDiscountGross, vatDefault)
        : null

    const shippingGross = toParasutAmount(order.shipping_total)
    // Canlı fatura: kargo KDV %20 (ürün %10) — net = brüt / 1.20
    const shippingNet =
      shippingGross > 0 ? grossToNet(shippingGross, vatShipping) : 0

    const estimatedGross = estimateGrossFromParasutLines({
      lines,
      shipping:
        shippingNet > 0
          ? { amount: shippingNet, vatRate: vatShipping }
          : null,
      orderDiscountNet: residualOrderDiscountNet,
      orderDiscountVatRate: vatDefault,
    })
    const orderTotal = toParasutAmount(order.total)
    const itemTotal = toParasutAmount(order.item_total)
    if (orderTotal > 0 && Math.abs(estimatedGross - orderTotal) > 0.05) {
      logger.warn(
        `[parasut-invoice] Gross check drift order=${orderId} estimated=${estimatedGross} order.total=${orderTotal} item_total=${itemTotal} shipping_total=${shippingGross}`
      )
    }

    const sales = await parasut.createSalesInvoice({
      contactId: contact.contactId,
      orderId: order.id,
      orderDisplayId: displayId,
      currencyCode: order.currency_code || "TRY",
      description: `Es Çay sipariş ${displayId}`,
      lines,
      orderDiscount: residualOrderDiscountNet,
      shipping:
        shippingNet > 0
          ? {
              description: "Kargo",
              amount: shippingNet,
              vatRate: vatShipping,
            }
          : null,
    })

    if (dryRun) {
      const draftMeta: ParasutOrderInvoiceMeta = {
        status: "draft_dryrun",
        mode,
        contact_id: contact.contactId,
        invoice_id: sales.invoiceId,
        tax_number: taxNumber,
        at: new Date().toISOString(),
        note: "dry_run_draft_not_formalized",
        retry_count: existing?.retry_count,
      }
      await writeOrderInvoiceMeta(scope, orderId, order.metadata, draftMeta)
      logger.info(
        `[parasut-invoice] DRY-RUN: taslak oluşturuldu, resmileştirilmedi, id=${sales.invoiceId} order=${orderId}`
      )
      return { ok: true, meta: draftMeta }
    }

    const pendingMeta: ParasutOrderInvoiceMeta = {
      status: "pending",
      mode,
      contact_id: contact.contactId,
      invoice_id: sales.invoiceId,
      tax_number: taxNumber,
      at: new Date().toISOString(),
      note: "sales_invoice_created_awaiting_formalization",
      retry_count: existing?.retry_count,
    }
    await writeOrderInvoiceMeta(scope, orderId, order.metadata, pendingMeta)

    const formal = await parasut.finalizeInvoice({
      invoiceId: sales.invoiceId,
      taxNumber,
      orderId: order.id,
      internetSale,
    })

    let pdfUrl: string | undefined
    try {
      const pdf = await parasut.getInvoicePdf(sales.invoiceId)
      pdfUrl = pdf.pdfUrl
    } catch (pdfErr) {
      logger.warn(
        `[parasut-invoice] PDF alınamadı order=${orderId}: ${String(pdfErr)}`
      )
    }

    const meta: ParasutOrderInvoiceMeta = {
      status: "issued",
      mode,
      contact_id: contact.contactId,
      invoice_id: sales.invoiceId,
      formal_id: formal.formalId,
      invoice_number: formal.invoiceNumber,
      invoice_type: formal.invoiceType,
      pdf_url: pdfUrl,
      tax_number: taxNumber,
      at: new Date().toISOString(),
      retry_count: existing?.retry_count,
    }
    await writeOrderInvoiceMeta(scope, orderId, order.metadata, meta)
    logger.info(
      `[parasut-invoice] Issued — order=${orderId} no=${meta.invoice_number} type=${meta.invoice_type} mode=${mode}`
    )
    try {
      await sendInvoiceIssuedEmail(scope, orderId, meta)
    } catch (mailErr) {
      logger.warn(
        `[parasut-invoice] Invoice email failed order=${orderId}: ${String(mailErr)}`
      )
    }
    return { ok: true, meta }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const apiBody =
      err instanceof ParasutError
        ? formatParasutErrorBody(err.responseBody)
        : ""
    if (apiBody) {
      logger.error(
        `[parasut-invoice] Parasut API error body order=${orderId}: ${apiBody}`
      )
    }
    const prev = (order.metadata?.parasut_invoice ||
      null) as ParasutOrderInvoiceMeta | null
    let preservedId = prev?.invoice_id
    let preservedContact = prev?.contact_id
    try {
      const { data: fresh } = await query.graph({
        entity: "order",
        fields: ["metadata"],
        filters: { id: orderId },
      })
      const fm = (fresh?.[0] as { metadata?: Record<string, unknown> } | undefined)
        ?.metadata
      const pi = fm?.parasut_invoice as ParasutOrderInvoiceMeta | undefined
      if (pi?.invoice_id) {
        preservedId = pi.invoice_id
        preservedContact = pi.contact_id
      }
    } catch {
      /* keep prev */
    }

    const meta: ParasutOrderInvoiceMeta = {
      status: "error",
      mode,
      tax_number: taxNumber,
      invoice_id: preservedId,
      contact_id: preservedContact,
      error: message.slice(0, 1500),
      at: new Date().toISOString(),
      note: preservedId
        ? "partial_failure_invoice_id_preserved"
        : "invoice_not_created",
      retry_count: prev?.retry_count || 0,
      admin_notified_at: prev?.admin_notified_at,
    }
    try {
      await writeOrderInvoiceMeta(scope, orderId, order.metadata, meta)
    } catch (markErr) {
      logger.error(
        `[parasut-invoice] Failed to mark error metadata — order=${orderId}: ${String(markErr)}`
      )
    }
    logger.error(
      `[parasut-invoice] FAILED (yasal risk — fatura kesilemedi) order=${orderId}: ${message}`
    )
    try {
      await notifyParasutInvoiceFailure(scope, orderId, meta)
    } catch (notifyErr) {
      logger.warn(
        `[parasut-invoice] Admin notify failed order=${orderId}: ${String(notifyErr)}`
      )
    }
    return { ok: false, meta }
  }
}
