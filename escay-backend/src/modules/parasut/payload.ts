/**
 * Parasut sales_invoice POST body — canlı HTTP ve mock inspection aynı formatı kullanır.
 * Tutarlar major-unit (TL, 2 ondalık); kuruş (×100) YOK.
 */

import { toParasutCurrency } from "./options"
import type { ParasutSalesInvoiceInput } from "./types"

export type ParasutSalesInvoiceDetailAttributes = {
  quantity: number
  unit_price: number
  vat_rate: number
  discount_type?: "amount" | "percentage"
  discount_value?: number
  description: string
}

export type ParasutSalesInvoiceDetail = {
  type: "sales_invoice_details"
  attributes: ParasutSalesInvoiceDetailAttributes
  relationships?: {
    product: { data: { type: "products"; id: string } }
  }
  meta: { index: number }
}

function productRelationship(
  productId?: string | null
): ParasutSalesInvoiceDetail["relationships"] | undefined {
  if (!productId) return undefined
  return { product: { data: { type: "products", id: productId } } }
}

export type ParasutSalesInvoicePayload = {
  data: {
    type: "sales_invoices"
    attributes: {
      item_type: "invoice"
      description: string
      issue_date: string
      due_date: string
      currency: string
      order_no: string
      invoice_discount_type?: "amount"
      invoice_discount_value?: number
    }
    relationships: {
      contact: {
        data: { type: "contacts"; id: string }
      }
      details: { data: ParasutSalesInvoiceDetail[] }
    }
  }
}

/**
 * Medusa order → Parasut API body. Mock modda da aynı builder çalışır (inspection).
 */
export function buildSalesInvoicePayload(
  input: ParasutSalesInvoiceInput
): ParasutSalesInvoicePayload {
  const details: ParasutSalesInvoiceDetail[] = input.lines.map((line, index) => {
    const attributes: ParasutSalesInvoiceDetailAttributes = {
      quantity: line.quantity,
      unit_price: line.unitPrice,
      vat_rate: line.vatRate,
      description: line.description,
    }
    if (line.discountValue && line.discountValue > 0) {
      attributes.discount_type = "amount"
      attributes.discount_value = line.discountValue
    } else if (line.discountRate && line.discountRate > 0) {
      attributes.discount_type = "percentage"
      attributes.discount_value = line.discountRate
    }
    const relationships = productRelationship(line.productId)
    return {
      type: "sales_invoice_details",
      attributes,
      ...(relationships ? { relationships } : {}),
      meta: { index },
    }
  })

  if (input.shipping && input.shipping.amount > 0) {
    const relationships = productRelationship(input.shipping.productId)
    details.push({
      type: "sales_invoice_details",
      attributes: {
        quantity: 1,
        unit_price: input.shipping.amount,
        vat_rate: input.shipping.vatRate,
        description: input.shipping.description || "Kargo",
      },
      ...(relationships ? { relationships } : {}),
      meta: { index: details.length },
    })
  }

  const attributes: ParasutSalesInvoicePayload["data"]["attributes"] = {
    item_type: "invoice",
    description:
      input.description ||
      `Es Çay sipariş ${input.orderDisplayId || input.orderId}`,
    issue_date: input.issueDate || new Date().toISOString().slice(0, 10),
    due_date: input.dueDate || new Date().toISOString().slice(0, 10),
    currency: toParasutCurrency(input.currencyCode),
    order_no: input.orderDisplayId || input.orderId,
  }
  if (input.orderDiscount && input.orderDiscount > 0) {
    attributes.invoice_discount_type = "amount"
    attributes.invoice_discount_value = input.orderDiscount
  }

  return {
    data: {
      type: "sales_invoices",
      attributes,
      relationships: {
        contact: {
          data: { type: "contacts", id: input.contactId },
        },
        details: { data: details },
      },
    },
  }
}

/** Satır + kargo + fatura indirimi üzerinden kaba brüt kontrol (KDV dahil değil — Parasut hesaplar). */
export function estimatePayloadNetTotal(
  payload: ParasutSalesInvoicePayload
): number {
  const details = payload.data.relationships.details.data
  let sum = 0
  for (const d of details) {
    const a = d.attributes
    let line = a.quantity * a.unit_price
    if (a.discount_type === "amount" && a.discount_value) {
      line -= a.discount_value * a.quantity
    } else if (a.discount_type === "percentage" && a.discount_value) {
      line -= line * (a.discount_value / 100)
    }
    sum += line
  }
  const invDisc = payload.data.attributes.invoice_discount_value || 0
  return Math.round((sum - invDisc) * 100) / 100
}
