/**
 * Sipariş → addinvoice müşteri bloğu (saf, HTTP yok).
 *
 * Kaynak sırası: fatura adresi metadata'sı (checkout yazar) önce gelir. Müşteri kartı
 * (customer.metadata) müşterinin kendi düzenleyebildiği alandır; yalnız invoice_type
 * yazılmamış eski siparişlerde son çare olarak okunur. Bireysel siparişte unvan ve
 * vergi dairesi hiç kullanılmaz; kimlik yalnız tam 10 (VKN) ya da tam 11 (TCKN) hane.
 */

import { districtFromMedusaAddress } from "@escay/shared/checkout-address"
import type { BizimhesapCustomerInput } from "./payload"

type Meta = Record<string, unknown> | null | undefined

export type InvoiceAddressLike = {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  city?: string | null
  province?: string | null
  address_1?: string | null
  address_2?: string | null
  metadata?: Meta
}

export type InvoiceOrderLike = {
  id: string
  email?: string | null
  metadata?: Meta
  shipping_address?: InvoiceAddressLike | null
  billing_address?: InvoiceAddressLike | null
  customer?: {
    id?: string | null
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    metadata?: Meta
  } | null
}

export type InvoiceType = "individual" | "corporate" | "unknown"

export type ResolvedInvoiceCustomer = {
  customer: BizimhesapCustomerInput
  invoiceType: InvoiceType
  taxNo: string | null
}

const VKN_KEYS = ["vkn", "tax_number"]
const TCKN_KEYS = ["tckn", "identity_number"]

function text(sources: Meta[], keys: string[]): string | null {
  for (const src of sources) {
    for (const key of keys) {
      const v = src?.[key]
      if (typeof v === "string" && v.trim()) return v.trim()
    }
  }
  return null
}

/** Tam 10 ya da tam 11 hane; başka uzunluk kimlik değildir. */
export function normalizeTaxNumber(
  value: unknown,
  allowed: (10 | 11)[] = [10, 11]
): string | null {
  if (typeof value !== "string") return null
  const digits = value.replace(/\D/g, "")
  return allowed.includes(digits.length as 10 | 11) ? digits : null
}

function taxNumber(sources: Meta[], keys: string[], allowed: (10 | 11)[]): string | null {
  for (const src of sources) {
    for (const key of keys) {
      const n = normalizeTaxNumber(src?.[key], allowed)
      if (n) return n
    }
  }
  return null
}

export function resolveInvoiceCustomer(order: InvoiceOrderLike): ResolvedInvoiceCustomer {
  const addr = order.billing_address || order.shipping_address || null
  const billMeta = order.billing_address?.metadata || null
  const shipMeta = order.shipping_address?.metadata || null
  const orderMeta = order.metadata || null
  const customerMeta = order.customer?.metadata || null

  const rawType = billMeta?.invoice_type
  const invoiceType: InvoiceType =
    rawType === "corporate" || rawType === "individual" ? rawType : "unknown"

  let taxNo: string | null = null
  let companyName: string | null = null
  let taxOffice: string | null = null

  if (invoiceType === "corporate") {
    taxNo = taxNumber([billMeta], VKN_KEYS, [10])
    companyName = text([billMeta], ["company_name"])
    taxOffice = text([billMeta], ["tax_office"])
  } else if (invoiceType === "individual") {
    taxNo = taxNumber([billMeta], TCKN_KEYS, [11])
  } else {
    // Eski / API siparişi: checkout metadata'sı yok, eski sıra; müşteri kartı en sonda.
    const legacy = [billMeta, shipMeta, orderMeta, customerMeta]
    taxNo = taxNumber(legacy, [...VKN_KEYS, ...TCKN_KEYS], [10, 11])
    companyName = text(legacy, ["company_name"])
    taxOffice = text(legacy, ["tax_office"])
  }

  const email = order.email || order.customer?.email || null
  const title =
    companyName ||
    [addr?.first_name, addr?.last_name].filter(Boolean).join(" ").trim() ||
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ").trim() ||
    email ||
    "Müşteri"

  // Checkout ilçeyi metadata.district, mahalleyi metadata.neighbourhood / address_2 yazar.
  const addrMeta = addr?.metadata || null
  const district = addr ? districtFromMedusaAddress(addr) || null : null
  const neighbourhood = text([addrMeta], ["neighbourhood"]) || addr?.address_2 || null

  return {
    invoiceType,
    taxNo,
    customer: {
      customerId: order.customer?.id || order.id,
      title,
      address: [addr?.address_1, neighbourhood, district, addr?.city].filter(Boolean).join(", "),
      taxOffice,
      taxNo,
      email,
      phone: addr?.phone,
    },
  }
}
