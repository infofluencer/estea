/**
 * Canlı Parasut TASLAK fatura (DRY-RUN). Resmileştirmez, silmez.
 *
 *   PARASUT_DRY_RUN=true PARASUT_DRY_RUN_ORDER_ID=order_xxx \
 *     npx medusa exec ./src/scripts/test-parasut-draft.ts
 *
 * Mevcut metadata.parasut_invoice (mock / eski taslak) yok sayılır — taze taslak.
 * Resmileştirmez. --force veya PARASUT_DRY_RUN_FORCE=1 aynı etki (script zaten force).
 *
 * PARASUT_DRY_RUN≠true ise ÇALIŞMAYI REDDEDER.
 */

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  buildParasutInternetSale,
  estimateGrossFromParasutLines,
  issueSalesInvoiceForOrder,
  toParasutAmount,
} from "../lib/parasut-invoice"
import {
  PARASUT_MODULE,
  assertParasutDryRunEnabled,
  isMockMode,
} from "../modules/parasut"
import ParasutModuleService from "../modules/parasut/service"

export default async function testParasutDraft({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  assertParasutDryRunEnabled()

  const parasut = container.resolve(PARASUT_MODULE) as ParasutModuleService
  const opts = parasut.getOptions()
  if (isMockMode(opts)) {
    throw new Error(
      "REDDEDİLDİ: Parasut kimliği yok (mock). Taslak canlı hesapta oluşsun diye PARASUT_CLIENT_ID/SECRET/USERNAME/PASSWORD/COMPANY_ID doldurun."
    )
  }
  if (!parasut.isDryRun()) {
    throw new Error(
      "REDDEDİLDİ: modül dryRun kapalı. PARASUT_DRY_RUN=true ile backend'i başlatın."
    )
  }

  const orderId = (
    process.env.PARASUT_DRY_RUN_ORDER_ID ||
    process.argv.find((a) => a.startsWith("order_")) ||
    ""
  ).trim()
  if (!orderId) {
    throw new Error(
      "REDDEDİLDİ: PARASUT_DRY_RUN_ORDER_ID=order_xxx verin (tek sipariş)."
    )
  }

  // Bu script her zaman taze taslak ister; --force / PARASUT_DRY_RUN_FORCE belgelik (aynı etki).
  const forceFreshDraft = true

  logger.info(
    `[parasut-draft] DRY-RUN start order=${orderId} company=${opts.companyId} forceFreshDraft=${forceFreshDraft} productCreate=${opts.productCreate}`
  )

  const result = await issueSalesInvoiceForOrder(container, orderId, {
    forceFreshDraft,
  })
  const client = parasut.getClient()
  const payload = client.lastSalesInvoicePayload
  const input = client.lastSalesInvoiceInput
  const internet = buildParasutInternetSale()

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "total",
      "email",
      "metadata",
      "billing_address.metadata",
      "billing_address.first_name",
      "billing_address.last_name",
    ],
    filters: { id: orderId },
  })
  const order = orders?.[0] as
    | {
        total?: unknown
        email?: string | null
        billing_address?: {
          first_name?: string | null
          last_name?: string | null
          metadata?: Record<string, unknown> | null
        } | null
      }
    | undefined

  const billMeta = order?.billing_address?.metadata || {}
  const grossEst = input
    ? estimateGrossFromParasutLines({
        lines: input.lines,
        shipping: input.shipping || null,
        orderDiscountNet: input.orderDiscount || null,
      })
    : null
  const paid = toParasutAmount(order?.total)

  const report = {
    dry_run: true,
    formalized: false,
    status: result.meta.status,
    draft_invoice_id: result.meta.invoice_id || null,
    contact_id: result.meta.contact_id || null,
    skipped: result.skipped || false,
    error: result.meta.error || null,
    lines: (input?.lines || []).map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit_price_net: l.unitPrice,
      vat_rate: l.vatRate,
      product_code: l.productCode || null,
      product_id: l.productId || null,
    })),
    shipping: input?.shipping
      ? {
          description: input.shipping.description,
          amount_net: input.shipping.amount,
          vat_rate: input.shipping.vatRate,
          product_code: opts.shippingProductId ? null : opts.shippingProductCode,
          product_id: input.shipping.productId || null,
        }
      : null,
    estimated_gross: grossEst,
    order_total_paid: paid,
    totals_match:
      grossEst != null && paid > 0 ? Math.abs(grossEst - paid) < 0.05 : null,
    internet_sale: internet,
    contact: {
      email: order?.email || null,
      name:
        (typeof billMeta.company_name === "string" && billMeta.company_name) ||
        [order?.billing_address?.first_name, order?.billing_address?.last_name]
          .filter(Boolean)
          .join(" ") ||
        null,
      vkn: billMeta.vkn || null,
      tckn: billMeta.tckn || null,
      tax_office: billMeta.tax_office || null,
      company_name: billMeta.company_name || null,
    },
    payload_preview: payload,
  }

  logger.info(
    report.draft_invoice_id
      ? `[parasut-draft] DRY-RUN: taslak oluşturuldu, resmileştirilmedi, id=${report.draft_invoice_id}`
      : `[parasut-draft] DRY-RUN: taslak OLUŞMADI status=${report.status} error=${report.error}`
  )
  logger.info(`[parasut-draft] REPORT\n${JSON.stringify(report, null, 2)}`)
  logger.info(
    "[parasut-draft] Taslağı Parasut panelinden ELLE silin. Bu script silmez / resmileştirmez."
  )
}
