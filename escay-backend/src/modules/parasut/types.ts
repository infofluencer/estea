/** Parasut e-belge tipi: VKN e-fatura mükellefi ise e_invoice, değilse e_archive. */
export type ParasutInvoiceType = "e_archive" | "e_invoice"

export type ParasutInvoiceStatus =
  | "issued"
  | "pending"
  | "error"
  | "skipped"
  | "canceled"
  /** DRY-RUN taslak — resmileştirilmedi; retry/finalize YASAK */
  | "draft_dryrun"

export type ParasutConnectionStatus = {
  mode: "mock" | "live"
  env: "test" | "prod"
  clientIdConfigured: boolean
  companyIdConfigured: boolean
  baseUrl: string
  oauthUrl: string
  dryRun: boolean
}

export type ParasutContactInput = {
  email?: string | null
  name: string
  taxNumber?: string | null
  taxOffice?: string | null
  phone?: string | null
  city?: string | null
  district?: string | null
  address?: string | null
  /** Sipariş id — mock contact id üretiminde kullanılır */
  orderId?: string
}

export type ParasutContactResult = {
  contactId: string
  created: boolean
  mock?: boolean
}

export type ParasutInvoiceLineInput = {
  description: string
  quantity: number
  /** Major-unit birim fiyat (KDV hariç — Medusa tax-inclusive brüt grossToNet ile çevrilir) */
  unitPrice: number
  vatRate: number
  discountRate?: number
  discountValue?: number
  /** Parasut ürün/hizmet kodu — Medusa variant SKU (Woo eşleşmesiyle aynı) */
  productCode?: string | null
  /** Parasut products id — client createSalesInvoice öncesi doldurur */
  productId?: string | null
}

export type ParasutProductInput = {
  code?: string | null
  name: string
  vatRate: number
  /** KDV hariç liste fiyatı (major unit) — yalnızca yeni kayıtta */
  listPrice?: number
}

/** GET /products kaydının eşleştirme için kullanılan alanları */
export type ParasutProductRecord = {
  id: string
  name: string
  code: string | null
  barcode: string | null
  vatRate: number | null
  listPrice: number | null
  currency: string | null
  archived: boolean
  inventoryTracking: boolean
  salesInvoiceDetailsCount: number | null
}

export type ParasutProductResult = {
  productId: string
  created: boolean
  mock?: boolean
}

export type ParasutSalesInvoiceInput = {
  contactId: string
  orderId: string
  orderDisplayId?: string | null
  currencyCode?: string
  issueDate?: string
  dueDate?: string
  description?: string
  lines: ParasutInvoiceLineInput[]
  /** Kargo satırı (varsa) */
  shipping?: {
    description?: string
    amount: number
    vatRate: number
    productId?: string | null
  } | null
  /** Sipariş geneli indirim (major unit) */
  orderDiscount?: number | null
}

export type ParasutSalesInvoiceResult = {
  invoiceId: string
  mock?: boolean
}

export type ParasutFinalizeInput = {
  invoiceId: string
  /** 10 haneli VKN veya 11 haneli TCKN; yoksa e_archive */
  taxNumber?: string | null
  orderId?: string
  /**
   * e-Arşiv internet satışı (GİB e-ticaret). Yalnızca e_archive POST'unda.
   * Canlı şablon: Ödeme Şekli=KREDIKARTI/BANKAKARTI, Aracı=PayTR.
   * NOT (Faz 2B): send_date / kargo satırı gerçek API + mali müşavir teyidi.
   */
  internetSale?: ParasutInternetSale | null
}

/** Parasut e_archives attributes.internet_sale */
export type ParasutInternetSale = {
  url: string
  /** Canlı şablon + OpenAPI enum — "KREDIKARTI" değil, slash'lı tam değer. */
  payment_type: "KREDIKARTI/BANKAKARTI" | "EFT/HAVALE" | "KAPIDAODEME" | "ODEMEARACISI"
  payment_platform: string
  /** YYYY-MM-DD */
  payment_date: string
  /**
   * NOT (Faz 2B): OpenAPI'de send_date var; ödeme anında kargo tarihi yok.
   * Gönderilmiyor — teslim/kargo sonrası ayrı teyit.
   */
  send_date?: string
}

export type ParasutFinalizeResult = {
  invoiceId: string
  formalId: string
  invoiceType: ParasutInvoiceType
  invoiceNumber: string
  uuid?: string
  mock?: boolean
}

export type ParasutPdfResult = {
  invoiceId: string
  pdfUrl: string
  mock?: boolean
}

export type ParasutCancelResult = {
  invoiceId: string
  canceled: boolean
  mock?: boolean
}

export type ParasutRefundInvoiceInput = {
  /** Orijinal satış faturası id */
  originalInvoiceId: string
  orderId: string
  returnId: string
  amount: number
  currencyCode?: string
  description?: string
  lines?: ParasutInvoiceLineInput[]
}

export type ParasutRefundInvoiceResult = {
  refundInvoiceId: string
  invoiceNumber: string
  invoiceType: ParasutInvoiceType
  amount: number
  pdfUrl?: string
  mock?: boolean
}

/** Order metadata.parasut_invoice */
export type ParasutOrderInvoiceMeta = {
  status: ParasutInvoiceStatus
  mode: "mock" | "live"
  contact_id?: string
  invoice_id?: string
  formal_id?: string
  invoice_number?: string
  invoice_type?: ParasutInvoiceType
  pdf_url?: string
  tax_number?: string | null
  error?: string
  at?: string
  note?: string
  /** Job retry sayacı (error/pending yeniden deneme) */
  retry_count?: number
  /** Admin hata maili gönderildi mi */
  admin_notified_at?: string
  /** Müşteri fatura maili gönderildi mi */
  customer_emailed_at?: string
}

/** Order metadata.parasut_refund_invoices[return_id] */
export type ParasutRefundInvoiceMeta = {
  status: ParasutInvoiceStatus
  mode: "mock" | "live"
  return_id: string
  refund_invoice_id?: string
  invoice_number?: string
  invoice_type?: ParasutInvoiceType
  amount?: number
  pdf_url?: string
  error?: string
  at?: string
  note?: string
}
