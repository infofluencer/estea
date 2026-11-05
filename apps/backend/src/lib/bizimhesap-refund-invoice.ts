/**
 * İade faturası: escay.return_refunded sonrası.
 * addinvoice yalnız satış/alış açar; iade faturası BizimHesap panelinden elle kesilir.
 * Burada iş kaybolmasın diye metadata + olay + admin maili bırakılır.
 * Reddedilen iade → işlem YOK. Idempotent: aynı return_id için ikinci kez uyarmaz.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type {
  BizimhesapOrderInvoiceMeta,
  BizimhesapRefundInvoiceMeta,
} from "../modules/bizimhesap"
import { asNumber, roundMoney } from "../modules/bizimhesap/payload"
import { notifyManualRefundInvoice } from "./bizimhesap-invoice-admin-notify"
import { recordOpsEvent } from "./ops-events"
import { isReturnRejected } from "./return-rejection"

export type RefundInvoiceResult = {
  ok: boolean
  skipped?: boolean
  meta: BizimhesapRefundInvoiceMeta
}

function readRefundMap(
  orderMeta: Record<string, unknown> | null | undefined
): Record<string, BizimhesapRefundInvoiceMeta> {
  const raw = orderMeta?.bizimhesap_refund_invoices
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return { ...(raw as Record<string, BizimhesapRefundInvoiceMeta>) }
}

export async function flagRefundInvoiceForReturn(
  scope: MedusaContainer,
  input: {
    return_id: string
    order_id: string
    amount: number
  }
): Promise<RefundInvoiceResult> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const returnId = input.return_id
  const orderId = input.order_id
  const amount = roundMoney(asNumber(input.amount))
  const at = new Date().toISOString()

  const { data: returns } = await query.graph({
    entity: "return",
    fields: ["id", "metadata"],
    filters: { id: returnId },
  })
  const ret = returns?.[0] as
    | { metadata?: Record<string, unknown> | null }
    | undefined

  // CRITICAL: rejected → fatura hareketi YOK
  if (ret && isReturnRejected(ret.metadata)) {
    logger.info(`[bizimhesap-refund] Skip — return=${returnId} rejected`)
    return {
      ok: false,
      skipped: true,
      meta: { status: "skipped", return_id: returnId, note: "escay_rejection", at },
    }
  }
  if (amount <= 0) {
    return {
      ok: false,
      skipped: true,
      meta: { status: "skipped", return_id: returnId, amount: 0, note: "zero_amount", at },
    }
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: orderId },
  })
  const order = orders?.[0] as
    | { id: string; metadata?: Record<string, unknown> | null }
    | undefined
  if (!order?.id) {
    logger.error(`[bizimhesap-refund] Order not found order=${orderId} return=${returnId}`)
    return {
      ok: false,
      meta: { status: "skipped", return_id: returnId, amount, note: "order_not_found", at },
    }
  }

  const map = readRefundMap(order.metadata)
  if (map[returnId]) {
    return { ok: true, skipped: true, meta: map[returnId] }
  }

  const sales = (order.metadata?.bizimhesap_invoice ||
    null) as BizimhesapOrderInvoiceMeta | null
  const meta: BizimhesapRefundInvoiceMeta = {
    status: "manual_required",
    return_id: returnId,
    amount,
    sales_guid: sales?.guid,
    at,
  }
  map[returnId] = meta
  await scope.resolve(Modules.ORDER).updateOrders([
    {
      id: orderId,
      metadata: { ...(order.metadata || {}), bizimhesap_refund_invoices: map },
    },
  ])

  await recordOpsEvent(scope, {
    kind: "invoice.refund_manual",
    level: "warning",
    title: `İade faturası BizimHesap'tan elle kesilecek — ${amount.toFixed(2)} TL`,
    orderId,
    data: { return_id: returnId, amount, sales_guid: sales?.guid ?? null },
  })
  try {
    await notifyManualRefundInvoice(scope, {
      order_id: orderId,
      return_id: returnId,
      amount,
    })
  } catch (err) {
    logger.warn(`[bizimhesap-refund] Admin notify failed return=${returnId}: ${String(err)}`)
  }

  logger.warn(`[bizimhesap-refund] Elle kesilecek — return=${returnId} amount=${amount}`)
  return { ok: true, meta }
}
