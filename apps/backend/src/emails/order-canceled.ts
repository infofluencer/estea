import { COMPANY } from "./company"
import { EMAIL_STYLES, emailLayout, escapeHtml, formatMoneyExact } from "./format"

/** Müşteriye — sipariş panelden iptal edildi (kargoya verilmeden), para iadesi bilgisi. */
export function buildOrderCanceledCustomerEmail(data: {
  orderDisplayId: string | number
  refundAmount: number
  currencyCode?: string
  /** Kartla ödenmemiş (havale): iade elle yapılacak */
  manualRefund?: boolean
  reason?: string | null
}): { subject: string; html: string; text: string } {
  const { orderDisplayId, refundAmount, currencyCode = "TRY", manualRefund, reason } = data
  const subject = `Siparişiniz İptal Edildi — #${orderDisplayId}`
  const money = formatMoneyExact(refundAmount, currencyCode)
  const refundLine =
    refundAmount <= 0
      ? ""
      : manualRefund
        ? `Ödediğiniz ${money} tutarındaki iade için sizinle ayrıca iletişime geçeceğiz.`
        : `Ödediğiniz ${money} kartınıza iade edildi. Tutar azami 14 gün içinde hesabınıza yansır; yansıma süresi bankanıza bağlıdır.`

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">Siparişiniz iptal edildi</h1>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      #${escapeHtml(String(orderDisplayId))} numaralı siparişiniz kargoya verilmeden iptal edildi.
    </p>
    ${
      reason
        ? `<p style="margin:0 0 16px;font-size:14px;line-height:22px;"><strong>Sebep:</strong> ${escapeHtml(reason)}</p>`
        : ""
    }
    ${refundLine ? `<p style="margin:0 0 16px;font-size:14px;line-height:22px;">${escapeHtml(refundLine)}</p>` : ""}
    <p style="margin:0;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Sorularınız için ${escapeHtml(COMPANY.emailOps)} adresine yazabilirsiniz.
    </p>
  `)

  const text = `Siparişiniz İptal Edildi — #${orderDisplayId}

#${orderDisplayId} numaralı siparişiniz kargoya verilmeden iptal edildi.
${reason ? `Sebep: ${reason}\n` : ""}${refundLine ? `${refundLine}\n` : ""}
Sorularınız için: ${COMPANY.emailOps}

— Es Çay`
  return { subject, html, text }
}
