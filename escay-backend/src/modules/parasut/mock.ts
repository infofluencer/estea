/**
 * Parasut mock yanıtları — kimlik bilgisi yokken gerçek HTTP atılmaz.
 */

import type {
  ParasutCancelResult,
  ParasutContactInput,
  ParasutContactResult,
  ParasutFinalizeInput,
  ParasutFinalizeResult,
  ParasutInvoiceType,
  ParasutPdfResult,
  ParasutRefundInvoiceInput,
  ParasutRefundInvoiceResult,
  ParasutSalesInvoiceInput,
  ParasutSalesInvoiceResult,
} from "./types"

function slug(value: string | undefined | null, fallback: string): string {
  const s = (value || "").replace(/[^a-zA-Z0-9]/g, "").slice(-8)
  return s || fallback
}

function isEInvoiceCandidate(taxNumber?: string | null): boolean {
  const digits = (taxNumber || "").replace(/\D/g, "")
  // 10 haneli VKN → e-fatura mükellefi kontrolü (mock: 10 hane + "ef" prefix simülasyonu yok;
  // stub: yalnızca 10 haneli ve "9" ile başlayanları e_invoice say — aksi e_archive)
  return digits.length === 10 && digits.startsWith("9")
}

export function resolveMockInvoiceType(
  taxNumber?: string | null
): ParasutInvoiceType {
  return isEInvoiceCandidate(taxNumber) ? "e_invoice" : "e_archive"
}

export function mockEnsureContact(
  input: ParasutContactInput
): ParasutContactResult {
  const id = `mock-contact-${slug(input.orderId || input.email || input.name, "x")}`
  return { contactId: id, created: true, mock: true }
}

export function mockCreateSalesInvoice(
  input: ParasutSalesInvoiceInput
): ParasutSalesInvoiceResult {
  return {
    invoiceId: `mock-inv-${slug(input.orderId, "order")}`,
    mock: true,
  }
}

export function mockFinalizeInvoice(
  input: ParasutFinalizeInput
): ParasutFinalizeResult {
  const invoiceType = resolveMockInvoiceType(input.taxNumber)
  const suffix = slug(input.orderId || input.invoiceId, "inv")
  const prefix = invoiceType === "e_invoice" ? "EF" : "EA"
  return {
    invoiceId: input.invoiceId,
    formalId: `mock-formal-${suffix}`,
    invoiceType,
    invoiceNumber: `${prefix}-MOCK-${suffix.toUpperCase()}`,
    uuid: `mock-uuid-${suffix}`,
    mock: true,
  }
}

export function mockGetInvoicePdf(invoiceId: string): ParasutPdfResult {
  return {
    invoiceId,
    pdfUrl: `https://mock.parasut.local/pdf/${encodeURIComponent(invoiceId)}.pdf`,
    mock: true,
  }
}

export function mockCancelInvoice(invoiceId: string): ParasutCancelResult {
  return { invoiceId, canceled: true, mock: true }
}

export function mockCreateRefundInvoice(
  input: ParasutRefundInvoiceInput
): ParasutRefundInvoiceResult {
  const suffix = slug(input.returnId, "ret")
  return {
    refundInvoiceId: `mock-refund-${suffix}`,
    invoiceNumber: `EA-MOCK-R-${suffix.toUpperCase()}`,
    invoiceType: "e_archive",
    amount: input.amount,
    pdfUrl: `https://mock.parasut.local/pdf/refund-${encodeURIComponent(suffix)}.pdf`,
    mock: true,
  }
}
