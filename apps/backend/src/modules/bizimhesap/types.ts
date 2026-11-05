/**
 * created  → BizimHesap kaydı açıldı (e-belge olup olmadığı API'den görünmez, panelden izlenir)
 * pending  → istek gönderiliyor; takılı kaldıysa sonuç bilinmiyor demektir
 * error    → BizimHesap reddetti ya da istek hiç gönderilmedi; yeniden denenebilir
 * unknown  → zaman aşımı / 5xx / okunamayan yanıt; kayıt oluşmuş olabilir, otomatik denenmez
 * dry_run  → payload hazırlandı, gönderilmedi
 */
export type BizimhesapInvoiceStatus =
  | "created"
  | "pending"
  | "error"
  | "unknown"
  | "skipped"
  | "dry_run"

export type BizimhesapConnectionStatus = {
  mode: "mock" | "live"
  baseUrl: string
  dryRun: boolean
}

export type BizimhesapOrderInvoiceMeta = {
  status: BizimhesapInvoiceStatus
  mode: "mock" | "live"
  guid?: string
  url?: string
  invoice_no?: string
  total?: number
  tax_number?: string | null
  error?: string
  at?: string
  note?: string
  /** Job retry sayacı */
  retry_count?: number
  /** Admin uyarı maili gönderildi mi */
  admin_notified_at?: string
}

/** addinvoice iade tipi desteklemez (3: satış, 5: alış); iade faturası panelden kesilir. */
export type BizimhesapRefundInvoiceMeta = {
  status: "manual_required" | "skipped"
  return_id: string
  amount?: number
  sales_guid?: string
  at?: string
  note?: string
}

/** addinvoice sonucu. */
export type BizimhesapInvoiceResult = {
  guid: string
  url?: string
  mock?: boolean
}
