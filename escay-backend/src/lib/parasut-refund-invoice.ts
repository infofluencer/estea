/**
 * İade faturası: escay.return_refunded sonrası.
 * Reddedilen iade → işlem YOK.
 * Idempotent: aynı return_id için ikinci kez kesilmez.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  PARASUT_MODULE,
  type ParasutOrderInvoiceMeta,
  type ParasutRefundInvoiceMeta,
} from "../modules/parasut"
import ParasutModuleService from "../modules/parasut/service"
import { isReturnRejected } from "./return-rejection"
import { isParasutDryRun } from "../modules/parasut/options"

export type IssueRefundInvoiceResult = {
  ok: boolean
  skipped?: boolean
  meta: ParasutRefundInvoiceMeta
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function readRefundMap(
  orderMeta: Record<string, unknown> | null | undefined
): Record<string, ParasutRefundInvoiceMeta> {
  const raw = orderMeta?.parasut_refund_invoices
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return { ...(raw as Record<string, ParasutRefundInvoiceMeta>) }
}

async function writeRefundMap(
  scope: MedusaContainer,
  orderId: string,
  existingMeta: Record<string, unknown> | null | undefined,
  map: Record<string, ParasutRefundInvoiceMeta>
) {
  const orderModule = scope.resolve(Modules.ORDER)
  await orderModule.updateOrders([
    {
      id: orderId,
      metadata: {
        ...(existingMeta || {}),
        parasut_refund_invoices: map,
      },
    },
  ])
}

/**
 * Refund başarılı olduktan sonra Parasut iade faturası.
 * Satış faturası yoksa error metadata yazar (görünür).
 */
export async function issueRefundInvoiceForReturn(
  scope: MedusaContainer,
  input: {
    return_id: string
    order_id: string
    amount: number
  }
): Promise<IssueRefundInvoiceResult> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const returnId = input.return_id
  const orderId = input.order_id
  const amount = roundMoney(asNumber(input.amount))

  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "order_id", "metadata", "status"],
    filters: { id: returnId },
  })
  const ret = returns?.[0] as
    | {
        id: string
        order_id?: string
        metadata?: Record<string, unknown> | null
        status?: string | null
      }
    | undefined

  // DRY-RUN: iade faturası resmileştirilmez
  if (isParasutDryRun()) {
    logger.info(
      `[parasut-refund-invoice] DRY-RUN skip — return=${returnId} (iade faturası yok)`
    )
    const meta: ParasutRefundInvoiceMeta = {
      status: "skipped",
      mode: "live",
      return_id: returnId,
      note: "dry_run",
      at: new Date().toISOString(),
    }
    return { ok: false, skipped: true, meta }
  }

  // CRITICAL: rejected → fatura hareketi YOK
  if (ret && isReturnRejected(ret.metadata)) {
    logger.info(
      `[parasut-refund-invoice] Skip — return=${returnId} rejected (no invoice movement)`
    )
    const meta: ParasutRefundInvoiceMeta = {
      status: "skipped",
      mode: "mock",
      return_id: returnId,
      note: "escay_rejection",
      at: new Date().toISOString(),
    }
    return { ok: false, skipped: true, meta }
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata", "currency_code"],
    filters: { id: orderId },
  })
  const order = orders?.[0] as
    | {
        id: string
        metadata?: Record<string, unknown> | null
        currency_code?: string | null
      }
    | undefined

  if (!order?.id) {
    const meta: ParasutRefundInvoiceMeta = {
      status: "error",
      mode: "mock",
      return_id: returnId,
      error: "Order not found",
      at: new Date().toISOString(),
    }
    logger.error(
      `[parasut-refund-invoice] Order not found order=${orderId} return=${returnId}`
    )
    return { ok: false, meta }
  }

  const map = readRefundMap(order.metadata)
  const existing = map[returnId]
  if (existing?.status === "issued" && existing.refund_invoice_id) {
    logger.info(
      `[parasut-refund-invoice] Idempotent skip — return=${returnId} refund=${existing.invoice_number}`
    )
    return { ok: true, skipped: true, meta: existing }
  }

  const sales = (order.metadata?.parasut_invoice ||
    null) as ParasutOrderInvoiceMeta | null
  if (!sales?.invoice_id || sales.status !== "issued") {
    const meta: ParasutRefundInvoiceMeta = {
      status: "error",
      mode: sales?.mode || "mock",
      return_id: returnId,
      amount,
      error:
        "Satış faturası yok veya kesilmemiş — iade faturası oluşturulamadı",
      at: new Date().toISOString(),
    }
    map[returnId] = meta
    await writeRefundMap(scope, orderId, order.metadata, map)
    logger.error(
      `[parasut-refund-invoice] FAILED (yasal risk) return=${returnId}: ${meta.error}`
    )
    return { ok: false, meta }
  }

  if (amount <= 0) {
    const meta: ParasutRefundInvoiceMeta = {
      status: "skipped",
      mode: sales.mode,
      return_id: returnId,
      amount: 0,
      error: "Refund amount is zero",
      at: new Date().toISOString(),
    }
    map[returnId] = meta
    await writeRefundMap(scope, orderId, order.metadata, map)
    return { ok: false, skipped: true, meta }
  }

  let parasut: ParasutModuleService
  try {
    parasut = scope.resolve(PARASUT_MODULE) as ParasutModuleService
  } catch (err) {
    const meta: ParasutRefundInvoiceMeta = {
      status: "error",
      mode: "mock",
      return_id: returnId,
      amount,
      error: `Parasut module unavailable: ${String(err)}`,
      at: new Date().toISOString(),
    }
    logger.error(`[parasut-refund-invoice] MODULE MISSING: ${meta.error}`)
    return { ok: false, meta }
  }

  const mode = parasut.getConnectionStatus().mode

  try {
    const result = await parasut.createRefundInvoice({
      originalInvoiceId: sales.invoice_id,
      orderId,
      returnId,
      amount,
      currencyCode: order.currency_code || "TRY",
      description: `Es Çay iade ${returnId}`,
    })

    const meta: ParasutRefundInvoiceMeta = {
      status: "issued",
      mode,
      return_id: returnId,
      refund_invoice_id: result.refundInvoiceId,
      invoice_number: result.invoiceNumber,
      invoice_type: result.invoiceType,
      amount: result.amount,
      pdf_url: result.pdfUrl,
      at: new Date().toISOString(),
    }
    map[returnId] = meta
    await writeRefundMap(scope, orderId, order.metadata, map)
    logger.info(
      `[parasut-refund-invoice] Issued — return=${returnId} no=${meta.invoice_number} amount=${amount} mode=${mode}`
    )
    return { ok: true, meta }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const meta: ParasutRefundInvoiceMeta = {
      status: "error",
      mode,
      return_id: returnId,
      amount,
      error: message.slice(0, 500),
      at: new Date().toISOString(),
    }
    map[returnId] = meta
    try {
      await writeRefundMap(scope, orderId, order.metadata, map)
    } catch (markErr) {
      logger.error(
        `[parasut-refund-invoice] Failed to mark error — return=${returnId}: ${String(markErr)}`
      )
    }
    logger.error(
      `[parasut-refund-invoice] FAILED (yasal risk) return=${returnId}: ${message}`
    )
    return { ok: false, meta }
  }
}
