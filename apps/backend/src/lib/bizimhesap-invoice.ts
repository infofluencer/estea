/**
 * Satış faturası: order → addinvoice → metadata.bizimhesap_invoice.
 *
 * BizimHesap'ta sorgu / düzeltme / silme / idempotency yok; yanlış ya da çift kayıt
 * ancak panelden temizlenir. Bu yüzden:
 *  - gönderim sipariş kilidi altında, öncesinde `pending` yazılır
 *  - sonucu belirsiz istek `unknown` olur, admin kontrol edip onay vermeden tekrar gitmez
 *  - toplam siparişle tutmuyorsa hiç gönderilmez
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { formatOrderNumber } from "@escay/shared/order-number"
import {
  BIZIMHESAP_MODULE,
  BizimhesapError,
  type BizimhesapOrderInvoiceMeta,
} from "../modules/bizimhesap"
import {
  asNumber,
  buildAddInvoicePayload,
  mapMedusaTaxRateToVat,
  roundMoney,
  type BizimhesapLineInput,
} from "../modules/bizimhesap/payload"
import { resolveInvoiceCustomer } from "../modules/bizimhesap/customer"
import BizimhesapModuleService from "../modules/bizimhesap/service"
import { isBankTransferOrder } from "./bank-transfer"
import { notifyBizimhesapInvoiceProblem } from "./bizimhesap-invoice-admin-notify"
import { recordOpsEvent } from "./ops-events"

export type IssueSalesInvoiceResult = {
  ok: boolean
  skipped?: boolean
  meta: BizimhesapOrderInvoiceMeta
}

export type IssueSalesInvoiceOptions = {
  /** Admin BizimHesap panelinde kaydın olmadığını doğruladı: pending/unknown yeniden gönderilebilir. */
  confirmedNotInBizimhesap?: boolean
}

/** Sipariş toplamı ile fatura toplamı arasında kabul edilen fark (TL). */
const TOTAL_TOLERANCE = 0.05

function lineDiscountAmount(item: {
  discount_total?: unknown
  adjustments?: { amount?: unknown }[] | null
}): number {
  const fromTotal = roundMoney(asNumber(item.discount_total))
  if (fromTotal > 0) return fromTotal
  return roundMoney(
    (item.adjustments || []).reduce((s, a) => s + Math.abs(asNumber(a.amount)), 0)
  )
}

/**
 * addinvoice'ta e-arşiv internet satışı alanı yok; bilgi kaybolmasın diye açıklamaya yazılır.
 * Açıkça verilen satış URL'i önce gelir; STOREFRONT_URL geçiş öncesi IP adresi olabilir.
 */
export function buildInvoiceNote(
  displayId: string,
  opts: { bankTransfer?: boolean; date?: string } = {}
): string {
  const rawUrl = (
    process.env.BIZIMHESAP_INTERNET_SALE_URL ||
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
  const payment = opts.bankTransfer
    ? `EFT/HAVALE (${(process.env.BANK_TRANSFER_BANK_NAME || "").trim() || "Banka"})`
    : "KREDIKARTI/BANKAKARTI (PayTR)"
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  return `Es Çay sipariş ${displayId}. İnternet satışı: ${url}. Ödeme: ${payment}, ${date}.`
}

/** Metadata taze okunur: aynı anda yazan başka akışın alanları ezilmesin. */
async function writeInvoiceMeta(
  scope: MedusaContainer,
  orderId: string,
  invoiceMeta: BizimhesapOrderInvoiceMeta
) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["metadata"],
    filters: { id: orderId },
  })
  const fresh = (data?.[0] as { metadata?: Record<string, unknown> | null } | undefined)
    ?.metadata
  await scope.resolve(Modules.ORDER).updateOrders([
    {
      id: orderId,
      metadata: { ...(fresh || {}), bizimhesap_invoice: invoiceMeta },
    },
  ])
}

async function reportProblem(
  scope: MedusaContainer,
  orderId: string,
  meta: BizimhesapOrderInvoiceMeta
) {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  await recordOpsEvent(scope, {
    kind: "invoice.failed",
    level: "error",
    title:
      meta.status === "unknown"
        ? "BizimHesap faturası belirsiz — panelden kontrol edin"
        : "BizimHesap faturası oluşturulamadı",
    detail: meta.error,
    orderId,
    data: { status: meta.status, retry_count: meta.retry_count ?? 0 },
    once: true,
  })
  try {
    await notifyBizimhesapInvoiceProblem(scope, orderId, meta)
  } catch (err) {
    logger.warn(`[bizimhesap-invoice] Admin notify failed order=${orderId}: ${String(err)}`)
  }
}

/** Sipariş teslim edildikten sonra BizimHesap satış faturası aç. */
export async function issueSalesInvoiceForOrder(
  scope: MedusaContainer,
  orderId: string,
  options?: IssueSalesInvoiceOptions
): Promise<IssueSalesInvoiceResult> {
  // Aynı sipariş için eşzamanlı iki gönderim (tekrarlanan event, job, admin) çift fatura yazar.
  const locking = scope.resolve(Modules.LOCKING) as {
    execute: <T>(
      keys: string | string[],
      job: () => Promise<T>,
      args?: { timeout?: number; ttl?: number }
    ) => Promise<T>
  }
  return locking.execute(
    `bizimhesap-invoice:${orderId}`,
    () => issueUnderLock(scope, orderId, options),
    { timeout: 45, ttl: 120 }
  )
}

async function issueUnderLock(
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
      "shipping_total",
      "items.id",
      "items.title",
      "items.quantity",
      // Sipariş kalemi adedi order_item'da (detail) durur; yalnız "items.quantity"
      // istenirse Medusa adedi boş döner ve toplamlar 0 hesaplanır.
      "items.detail.quantity",
      "items.unit_price",
      "items.is_tax_inclusive",
      "items.variant_sku",
      "items.variant_id",
      "items.discount_total",
      "items.tax_lines.rate",
      "items.adjustments.amount",
      "shipping_address.first_name",
      "shipping_address.last_name",
      "shipping_address.phone",
      "shipping_address.city",
      "shipping_address.province",
      "shipping_address.address_1",
      "shipping_address.address_2",
      "shipping_address.metadata",
      "billing_address.first_name",
      "billing_address.last_name",
      "billing_address.phone",
      "billing_address.city",
      "billing_address.province",
      "billing_address.address_1",
      "billing_address.address_2",
      "billing_address.metadata",
      "customer.id",
      "customer.email",
      "customer.first_name",
      "customer.last_name",
      "customer.metadata",
    ],
    filters: { id: orderId },
  })

  type Address = {
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    city?: string | null
    province?: string | null
    address_1?: string | null
    address_2?: string | null
    metadata?: Record<string, unknown> | null
  }
  const order = orders?.[0] as
    | {
        id: string
        display_id?: number | string | null
        status?: string | null
        email?: string | null
        currency_code?: string | null
        metadata?: Record<string, unknown> | null
        total?: unknown
        shipping_total?: unknown
        items?: {
          title?: string | null
          quantity?: unknown
          detail?: { quantity?: unknown } | null
          unit_price?: unknown
          is_tax_inclusive?: boolean | null
          variant_sku?: string | null
          variant_id?: string | null
          discount_total?: unknown
          tax_lines?: { rate?: unknown }[] | null
          adjustments?: { amount?: unknown }[] | null
        }[]
        shipping_address?: Address | null
        billing_address?: Address | null
        customer?: {
          id?: string | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          metadata?: Record<string, unknown> | null
        } | null
      }
    | undefined

  if (!order?.id) {
    logger.error(`[bizimhesap-invoice] Order not found id=${orderId}`)
    return {
      ok: false,
      meta: {
        status: "error",
        mode: "mock",
        error: "Order not found",
        at: new Date().toISOString(),
      },
    }
  }

  const existing = (order.metadata?.bizimhesap_invoice ||
    null) as BizimhesapOrderInvoiceMeta | null

  if (existing?.status === "created" || existing?.status === "dry_run") {
    logger.info(
      `[bizimhesap-invoice] Idempotent skip — order=${orderId} status=${existing.status} guid=${existing.guid || "-"}`
    )
    return { ok: true, skipped: true, meta: existing }
  }
  if (
    (existing?.status === "pending" || existing?.status === "unknown") &&
    !options?.confirmedNotInBizimhesap
  ) {
    logger.warn(
      `[bizimhesap-invoice] Skip — order=${orderId} status=${existing.status}: kayıt oluşmuş olabilir, admin onayı gerekir`
    )
    return { ok: false, skipped: true, meta: existing }
  }

  if (order.status === "canceled") {
    const meta: BizimhesapOrderInvoiceMeta = {
      status: "skipped",
      mode: existing?.mode || "mock",
      error: "Order canceled",
      at: new Date().toISOString(),
      note: "canceled",
    }
    await writeInvoiceMeta(scope, orderId, meta)
    return { ok: false, skipped: true, meta }
  }

  const bizimhesap = scope.resolve(BIZIMHESAP_MODULE) as BizimhesapModuleService
  const { mode } = bizimhesap.getConnectionStatus()
  const vatDefault = bizimhesap.getDefaultVatRate()
  const displayId =
    formatOrderNumber(order.display_id) || String(order.display_id ?? order.id)

  // Fatura adresi metadata'sı önce; müşteri kartı yalnız invoice_type'sız eski siparişte.
  const invoiceCustomer = resolveInvoiceCustomer(order)
  const taxNumber = invoiceCustomer.taxNo

  const prevFields = {
    retry_count: existing?.retry_count,
    admin_notified_at: existing?.admin_notified_at,
  }

  try {
    const lines: BizimhesapLineInput[] = (order.items || []).map((item) => {
      const vatRate = mapMedusaTaxRateToVat(item.tax_lines?.[0]?.rate, vatDefault)
      const unitPrice = asNumber(item.unit_price)
      return {
        // SKU yeniden tohumlamada değişmez; BizimHesap ürünü bu kimlikle eşler / açar.
        productId: item.variant_sku || item.variant_id || item.title || "URUN",
        productName: item.title || item.variant_sku || "Ürün",
        vatRate,
        quantity: Math.max(
          1,
          asNumber(item.detail?.quantity) || asNumber(item.quantity) || 1
        ),
        // Vergi satırı yoksa siparişe KDV eklenmemiştir; fallback oran brütü büyütmemeli.
        grossUnitPrice:
          item.is_tax_inclusive === false && item.tax_lines?.length
            ? roundMoney(unitPrice * (1 + vatRate / 100))
            : unitPrice,
        discountGross: lineDiscountAmount(item),
      }
    })

    const { payload, total } = buildAddInvoicePayload({
      firmId: bizimhesap.getFirmId(),
      invoiceNo: displayId,
      note: buildInvoiceNote(displayId, {
        bankTransfer: isBankTransferOrder(order),
      }),
      currencyCode: order.currency_code,
      customer: invoiceCustomer.customer,
      lines,
      shipping: {
        grossAmount: roundMoney(asNumber(order.shipping_total)),
        vatRate: bizimhesap.getShippingVatRate(),
      },
    })

    const orderTotal = roundMoney(asNumber(order.total))
    if (Math.abs(total - orderTotal) > TOTAL_TOLERANCE) {
      throw new BizimhesapError(
        `Fatura toplamı siparişle tutmuyor: fatura=${total} sipariş=${orderTotal}. Gönderilmedi.`,
        true
      )
    }

    if (mode === "live" && bizimhesap.isDryRun()) {
      const meta: BizimhesapOrderInvoiceMeta = {
        ...prevFields,
        status: "dry_run",
        mode,
        invoice_no: displayId,
        total,
        tax_number: taxNumber,
        at: new Date().toISOString(),
        note: "dry_run_not_sent",
      }
      await writeInvoiceMeta(scope, orderId, meta)
      logger.info(
        `[bizimhesap-invoice] DRY-RUN: gönderilmedi order=${orderId} no=${displayId} total=${total}`
      )
      return { ok: true, meta }
    }

    await writeInvoiceMeta(scope, orderId, {
      ...prevFields,
      status: "pending",
      mode,
      invoice_no: displayId,
      total,
      tax_number: taxNumber,
      at: new Date().toISOString(),
    })

    const result = await bizimhesap.addInvoice(payload)

    const meta: BizimhesapOrderInvoiceMeta = {
      status: "created",
      mode,
      guid: result.guid,
      url: result.url,
      invoice_no: displayId,
      total,
      tax_number: taxNumber,
      at: new Date().toISOString(),
      retry_count: existing?.retry_count,
    }
    try {
      await writeInvoiceMeta(scope, orderId, meta)
    } catch (markErr) {
      // Kayıt BizimHesap'ta açıldı; metadata `pending` kalır, job `unknown`a çeker. Tekrar gönderilmez.
      logger.error(
        `[bizimhesap-invoice] Kayıt açıldı ama metadata yazılamadı order=${orderId} guid=${result.guid}: ${String(markErr)}`
      )
    }
    logger.info(
      `[bizimhesap-invoice] Created — order=${orderId} no=${displayId} guid=${result.guid} mode=${mode}`
    )
    return { ok: true, meta }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // BizimhesapError dışı hata isteğe varmadan oluşur (hesap, metadata); kayıt açılmamıştır.
    const uncertain = err instanceof BizimhesapError && !err.rejected
    const meta: BizimhesapOrderInvoiceMeta = {
      ...prevFields,
      status: uncertain ? "unknown" : "error",
      mode,
      invoice_no: displayId,
      tax_number: taxNumber,
      error: message.slice(0, 1500),
      at: new Date().toISOString(),
    }
    try {
      await writeInvoiceMeta(scope, orderId, meta)
    } catch (markErr) {
      logger.error(
        `[bizimhesap-invoice] Failed to mark ${meta.status} — order=${orderId}: ${String(markErr)}`
      )
    }
    logger.error(
      `[bizimhesap-invoice] ${meta.status.toUpperCase()} (yasal risk — fatura doğrulanamadı) order=${orderId}: ${message}`
    )
    await reportProblem(scope, orderId, meta)
    return { ok: false, meta }
  }
}

/** Süresi geçmiş `pending` (süreç gönderim sırasında öldü): belirsiz sayılır, uyarı gider. */
export async function markStalePendingInvoiceUnknown(
  scope: MedusaContainer,
  orderId: string,
  existing: BizimhesapOrderInvoiceMeta
): Promise<void> {
  const meta: BizimhesapOrderInvoiceMeta = {
    ...existing,
    status: "unknown",
    error: "Gönderim yarıda kaldı; kayıt oluşmuş olabilir. BizimHesap panelinden kontrol edin.",
    at: new Date().toISOString(),
  }
  await writeInvoiceMeta(scope, orderId, meta)
  await reportProblem(scope, orderId, meta)
}
