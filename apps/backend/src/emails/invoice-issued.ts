import { emailLayout, escapeHtml, EMAIL_STYLES } from "./format"

export type InvoiceIssuedEmailData = {
  displayId: string
  invoiceNumber: string
  invoiceType: "e_archive" | "e_invoice"
  pdfUrl?: string | null
  supportEmail: string
}

/** Paraşüt resmi numara henüz dönmediyse yedek kimlik yazılır ("e_archive-<id>") — müşteriye gösterilmez. */
export function isPlaceholderInvoiceNumber(value: string | null | undefined): boolean {
  return !value || /^e_(archive|invoice)-/i.test(value)
}

export function buildInvoiceIssuedEmail(data: InvoiceIssuedEmailData): {
  subject: string
  html: string
  text: string
} {
  const typeLabel =
    data.invoiceType === "e_invoice" ? "e-Fatura" : "e-Arşiv Fatura"
  const subject = `${typeLabel} — Sipariş #${data.displayId}`

  const pdfHtml = data.pdfUrl
    ? `<p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(data.pdfUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:3px;background:${EMAIL_STYLES.brandColor};">
        Faturayı indir (PDF)
      </a>
    </p>`
    : `<p style="margin:0 0 24px;font-size:14px;color:${EMAIL_STYLES.mutedColor};">
      Faturanızın PDF kopyasına ihtiyaç duyarsanız ${escapeHtml(data.supportEmail)} adresine yazmanız yeterli.
    </p>`

  const pdfText = data.pdfUrl
    ? `Faturayı indir: ${data.pdfUrl}\n`
    : `Faturanızın PDF kopyası için ${data.supportEmail} adresine yazabilirsiniz.\n`

  const showNumber = !isPlaceholderInvoiceNumber(data.invoiceNumber)
  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">${escapeHtml(typeLabel)} hazır</h1>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      Siparişiniz için faturanız oluşturuldu.
    </p>
    <p style="margin:0 0 12px;padding:16px;background:${EMAIL_STYLES.bgColor};border-radius:6px;font-size:15px;">
      <strong>Sipariş No:</strong> #${escapeHtml(data.displayId)}${
        showNumber ? `<br>\n      <strong>Fatura No:</strong> ${escapeHtml(data.invoiceNumber)}` : ""
      }
    </p>
    ${pdfHtml}
  `)

  const text = `${typeLabel} — Sipariş #${data.displayId}

Sipariş No: #${data.displayId}
${showNumber ? `Fatura No: ${data.invoiceNumber}\n` : ""}
${pdfText}
— Es Çay`

  return { subject, html, text }
}
