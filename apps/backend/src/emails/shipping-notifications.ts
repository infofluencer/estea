import {
  EMAIL_STYLES,
  emailLayout,
  escapeHtml,
} from "./format"

export type ShippingStatusEmailData = {
  orderDisplayId: string
  email: string
  trackingNumber?: string | null
  trackingUrl?: string | null
  carrierCode?: string | null
  trackingPageUrl?: string | null
}

function trackingBlockHtml(data: ShippingStatusEmailData): string {
  const parts: string[] = []
  if (data.carrierCode) {
    parts.push(
      `<p style="margin:0 0 8px;font-size:14px;color:${EMAIL_STYLES.mutedColor};">Kargo: <strong style="color:${EMAIL_STYLES.brandColor};">${escapeHtml(data.carrierCode)}</strong></p>`
    )
  }
  if (data.trackingNumber) {
    parts.push(
      `<p style="margin:0 0 8px;font-size:14px;">Takip No: <strong>${escapeHtml(data.trackingNumber)}</strong></p>`
    )
  }
  if (data.trackingUrl) {
    parts.push(
      `<p style="margin:16px 0 0;text-align:center;">
        <a href="${escapeHtml(data.trackingUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:3px;background:${EMAIL_STYLES.brandColor};">
          Kargonu takip et
        </a>
      </p>`
    )
  }
  return parts.join("")
}

function trackingBlockText(data: ShippingStatusEmailData): string {
  const lines: string[] = []
  if (data.carrierCode) lines.push(`Kargo: ${data.carrierCode}`)
  if (data.trackingNumber) lines.push(`Takip No: ${data.trackingNumber}`)
  if (data.trackingUrl) lines.push(`Takip: ${data.trackingUrl}`)
  return lines.join("\n")
}

export function buildOrderShippedEmail(data: ShippingStatusEmailData): {
  subject: string
  html: string
  text: string
} {
  const subject = `Siparişiniz kargoya verildi — #${data.orderDisplayId}`
  const trackPage = data.trackingPageUrl
    ? `<p style="margin:16px 0 0;font-size:13px;color:${EMAIL_STYLES.mutedColor};text-align:center;">
        <a href="${escapeHtml(data.trackingPageUrl)}" style="color:${EMAIL_STYLES.accentColor};">Sipariş takibi</a>
      </p>`
    : ""

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">Siparişiniz kargoda</h1>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      #${escapeHtml(data.orderDisplayId)} numaralı siparişiniz kargoya verildi.
    </p>
    <div style="margin:0 0 24px;padding:16px;background:${EMAIL_STYLES.bgColor};border-radius:6px;">
      ${trackingBlockHtml(data) || `<p style="margin:0;font-size:14px;color:${EMAIL_STYLES.mutedColor};">Takip bilgisi hazır olduğunda burada görünecek.</p>`}
    </div>
    ${trackPage}
  `)

  const text = `${subject}

#${data.orderDisplayId} numaralı siparişiniz kargoya verildi.

${trackingBlockText(data)}
${data.trackingPageUrl ? `\nSipariş takibi: ${data.trackingPageUrl}` : ""}

— Es Çay`

  return { subject, html, text }
}

export function buildOrderDeliveredEmail(data: ShippingStatusEmailData): {
  subject: string
  html: string
  text: string
} {
  const subject = `Siparişiniz teslim edildi — #${data.orderDisplayId}`
  const trackPage = data.trackingPageUrl
    ? `<p style="margin:16px 0 0;font-size:13px;color:${EMAIL_STYLES.mutedColor};text-align:center;">
        <a href="${escapeHtml(data.trackingPageUrl)}" style="color:${EMAIL_STYLES.accentColor};">Sipariş detayı</a>
      </p>`
    : ""

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">Teslim edildi</h1>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      #${escapeHtml(data.orderDisplayId)} numaralı siparişiniz teslim edildi. Es Çay'i tercih ettiğiniz için teşekkürler.
    </p>
    <div style="margin:0 0 24px;padding:16px;background:${EMAIL_STYLES.bgColor};border-radius:6px;">
      ${trackingBlockHtml(data)}
    </div>
    ${trackPage}
    <p style="margin:0;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Cayma / iade hakkınız için sipariş takibi veya hesabınızdaki sipariş detayından talep oluşturabilirsiniz.
    </p>
  `)

  const text = `${subject}

#${data.orderDisplayId} numaralı siparişiniz teslim edildi.

${trackingBlockText(data)}
${data.trackingPageUrl ? `\nSipariş detayı: ${data.trackingPageUrl}` : ""}

Cayma / iade için sipariş takibi veya hesabınızı kullanabilirsiniz.

— Es Çay`

  return { subject, html, text }
}
