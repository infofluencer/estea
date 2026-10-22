import {
  emailLayout,
  escapeHtml,
  formatAddress,
  formatMoney,
  formatMoneyExact,
  EMAIL_STYLES,
} from "./format"

export type OrderLineItem = {
  title?: string | null
  quantity?: number | null
  unit_price?: number | string | null
  variant_title?: string | null
  variant?: {
    title?: string | null
    options?: { value?: string | null }[] | null
  } | null
}

export type OrderConfirmationData = {
  displayId: string
  email: string
  /** Deep link to guest order detail (`/order-tracking/[id]?email=`). */
  trackingUrl?: string
  /** Form page (`/order-tracking`) — sipariş no + e-posta ile sorgu. */
  trackingFormUrl?: string
  currencyCode: string
  items: OrderLineItem[]
  itemTotal?: number | string | null
  discountTotal?: number | string | null
  shippingTotal?: number | string | null
  taxTotal?: number | string | null
  total?: number | string | null
  shippingAddress?: Parameters<typeof formatAddress>[0]
  /** Varsa Parasut PDF (çoğu zaman ayrı fatura maili gider; burada yedek). */
  invoicePdfUrl?: string | null
  /** Havale siparişi verildi, ödeme bekleniyor → IBAN bloğu + farklı başlık. */
  /** Havale ile verilip admin'den "havale alındı" onaylanan sipariş — onay mailinde belirtilir. */
  paidByBankTransfer?: boolean
  bankTransfer?: {
    bank_name: string
    account_name: string
    iban: string
  } | null
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "string") {
    return Number(value) || 0
  }
  return value ?? 0
}

function itemVariantLabel(item: OrderLineItem): string {
  const parts: string[] = []
  if (item.variant_title && item.variant_title !== "Default") {
    parts.push(item.variant_title)
  }
  const optionValues =
    item.variant?.options?.map((o) => o.value).filter(Boolean) ?? []
  for (const v of optionValues) {
    if (v && !parts.includes(v)) {
      parts.push(v)
    }
  }
  return parts.join(" / ") || "—"
}

export function buildOrderConfirmationEmail(data: OrderConfirmationData): {
  subject: string
  html: string
  text: string
} {
  const {
    displayId,
    currencyCode,
    items,
    itemTotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    total,
    shippingAddress,
    trackingUrl,
    trackingFormUrl,
    invoicePdfUrl,
    email,
    bankTransfer,
    paidByBankTransfer,
  } = data

  const discountAmount = toNumber(discountTotal)

  const subject = bankTransfer
    ? `Ödemeniz Bekleniyor — #${displayId}`
    : paidByBankTransfer
      ? `Havale Ödemeniz Alındı — #${displayId}`
      : `Siparişiniz Alındı — #${displayId}`

  const heading = bankTransfer
    ? "Siparişiniz oluşturuldu"
    : paidByBankTransfer
      ? "Havale ödemeniz alındı"
      : "Siparişiniz alındı"
  const intro = bankTransfer
    ? "Teşekkür ederiz! Siparişiniz oluşturuldu. Havale / EFT ödemeniz hesabımıza geçtiğinde siparişiniz hazırlanmaya başlar."
    : paidByBankTransfer
      ? "Teşekkür ederiz! Havale / EFT ödemeniz hesabımıza ulaştı. Siparişiniz hazırlanıyor; kargoya verildiğinde takip bilgisini e-postayla ileteceğiz."
      : "Teşekkür ederiz! Siparişiniz başarıyla oluşturuldu."

  const bankRows = bankTransfer
    ? [
        bankTransfer.bank_name ? ["Banka", bankTransfer.bank_name] : null,
        ["Alıcı", bankTransfer.account_name],
        ["IBAN", bankTransfer.iban],
        ["Tutar", formatMoneyExact(total, currencyCode)],
        ["Açıklama", `Sipariş no #${displayId}`],
      ].filter((r): r is string[] => Boolean(r))
    : []

  const bankHtml = bankTransfer
    ? `<div style="margin:0 0 24px;padding:16px 20px;border:2px solid ${EMAIL_STYLES.brandColor};border-radius:6px;">
      <h2 style="margin:0 0 12px;font-size:16px;color:${EMAIL_STYLES.brandColor};">Havale / EFT bilgileri</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${bankRows
          .map(
            ([k, v]) => `<tr>
          <td style="padding:4px 12px 4px 0;font-size:13px;color:${EMAIL_STYLES.mutedColor};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>
          <td style="padding:4px 0;font-size:14px;font-weight:600;color:${EMAIL_STYLES.brandColor};word-break:break-all;">${escapeHtml(v)}</td>
        </tr>`
          )
          .join("")}
      </table>
      <p style="margin:12px 0 0;font-size:13px;line-height:20px;color:${EMAIL_STYLES.mutedColor};">
        Lütfen açıklamaya sipariş numaranızı yazın ve tutarı eksiksiz gönderin. Ödemeniz onaylandığında size ayrıca e-posta göndereceğiz.
      </p>
    </div>`
    : ""

  const bankText = bankTransfer
    ? `\nHavale / EFT bilgileri:\n${bankRows.map(([k, v]) => `${k}: ${v}`).join("\n")}\nLütfen açıklamaya sipariş numaranızı yazın ve tutarı eksiksiz gönderin.\n`
    : ""

  const trackingHtml = trackingUrl
    ? `<p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(trackingUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:3px;background:${EMAIL_STYLES.brandColor};">
        Siparişini takip et
      </a>
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;color:${EMAIL_STYLES.mutedColor};">
      Direkt link:<br>
      <a href="${escapeHtml(trackingUrl)}" target="_blank" style="color:${EMAIL_STYLES.accentColor};">${escapeHtml(trackingUrl)}</a>
    </p>`
    : trackingFormUrl
      ? `<p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;color:${EMAIL_STYLES.mutedColor};">
      Direkt link:<br>
      <a href="${escapeHtml(trackingFormUrl)}" target="_blank" style="color:${EMAIL_STYLES.accentColor};">${escapeHtml(trackingFormUrl)}</a>
    </p>`
      : ""

  const trackingText = trackingUrl
    ? `\nSiparişini takip et: ${trackingUrl}\n`
    : trackingFormUrl
      ? `\nSipariş takibi: ${trackingFormUrl}\n`
      : ""

  const invoiceHtml = invoicePdfUrl
    ? `<p style="margin:0 0 24px;text-align:center;">
      <a href="${escapeHtml(invoicePdfUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:600;color:${EMAIL_STYLES.brandColor};text-decoration:underline;">
        Faturanızı indirin (PDF)
      </a>
    </p>`
    : ""

  const invoiceText = invoicePdfUrl
    ? `\nFaturanızı indirin: ${invoicePdfUrl}\n`
    : ""

  const itemRowsHtml = items
    .map((item) => {
      const qty = item.quantity ?? 1
      const lineTotal = toNumber(item.unit_price) * qty
      const variant = itemVariantLabel(item)
      return `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${EMAIL_STYLES.borderColor};">
          <strong style="color:${EMAIL_STYLES.brandColor};">${escapeHtml(item.title ?? "Ürün")}</strong><br>
          <span style="font-size:13px;color:${EMAIL_STYLES.mutedColor};">${escapeHtml(variant)}</span>
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid ${EMAIL_STYLES.borderColor};text-align:center;color:${EMAIL_STYLES.mutedColor};">${qty}</td>
        <td style="padding:12px 0;border-bottom:1px solid ${EMAIL_STYLES.borderColor};text-align:right;white-space:nowrap;">${formatMoney(lineTotal, currencyCode)}</td>
      </tr>`
    })
    .join("")

  const itemRowsText = items
    .map((item) => {
      const qty = item.quantity ?? 1
      const lineTotal = toNumber(item.unit_price) * qty
      return `- ${item.title ?? "Ürün"} (${itemVariantLabel(item)}) x${qty}: ${formatMoney(lineTotal, currencyCode)}`
    })
    .join("\n")

  const addressHtml = escapeHtml(formatAddress(shippingAddress)).replace(
    /\n/g,
    "<br>"
  )
  const addressText = formatAddress(shippingAddress)

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">${heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      ${intro}
      Sipariş numaranız: <strong style="color:${EMAIL_STYLES.brandColor};">#${escapeHtml(displayId)}</strong>
    </p>

    ${bankHtml}
    ${trackingHtml}
    ${invoiceHtml}

    <h2 style="margin:0 0 12px;font-size:16px;color:${EMAIL_STYLES.brandColor};">Ürünler</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <th align="left" style="padding:8px 0;font-size:12px;color:${EMAIL_STYLES.mutedColor};border-bottom:2px solid ${EMAIL_STYLES.borderColor};">Ürün</th>
        <th style="padding:8px;font-size:12px;color:${EMAIL_STYLES.mutedColor};border-bottom:2px solid ${EMAIL_STYLES.borderColor};">Adet</th>
        <th align="right" style="padding:8px 0;font-size:12px;color:${EMAIL_STYLES.mutedColor};border-bottom:2px solid ${EMAIL_STYLES.borderColor};">Tutar</th>
      </tr>
      ${itemRowsHtml}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:4px 0;color:${EMAIL_STYLES.mutedColor};">Ara Toplam</td>
        <td align="right">${formatMoney(itemTotal, currencyCode)}</td>
      </tr>
      ${
        discountAmount > 0
          ? `<tr>
        <td style="padding:4px 0;color:${EMAIL_STYLES.mutedColor};">İndirim</td>
        <td align="right">−${formatMoney(discountAmount, currencyCode)}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding:4px 0;color:${EMAIL_STYLES.mutedColor};">Kargo</td>
        <td align="right">${formatMoney(shippingTotal, currencyCode)}</td>
      </tr>
      ${
        taxTotal
          ? `<tr>
        <td style="padding:4px 0;color:${EMAIL_STYLES.mutedColor};">KDV</td>
        <td align="right">${formatMoney(taxTotal, currencyCode)}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding:12px 0 0;font-size:16px;font-weight:600;color:${EMAIL_STYLES.brandColor};">Toplam (KDV dahil)</td>
        <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:600;color:${EMAIL_STYLES.brandColor};">${formatMoney(total, currencyCode)}</td>
      </tr>
    </table>

    <h2 style="margin:0 0 8px;font-size:16px;color:${EMAIL_STYLES.brandColor};">Teslimat Adresi</h2>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:${EMAIL_STYLES.mutedColor};">${addressHtml}</p>

    <p style="margin:0;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      ${bankTransfer ? "Siparişiniz ödemeniz onaylandıktan sonra" : "Siparişiniz"} 2–5 iş günü içinde kargoya verilecektir. Kargo takip bilgisi hazır olduğunda size iletilecektir.
    </p>
  `)

  const text = `${subject}

${intro}

Sipariş No: #${displayId}
${bankText}${trackingText}${invoiceText}
Ürünler:
${itemRowsText}

Ara Toplam: ${formatMoney(itemTotal, currencyCode)}
${discountAmount > 0 ? `İndirim: −${formatMoney(discountAmount, currencyCode)}\n` : ""}Kargo: ${formatMoney(shippingTotal, currencyCode)}
${taxTotal ? `KDV: ${formatMoney(taxTotal, currencyCode)}\n` : ""}Toplam (KDV dahil): ${formatMoney(total, currencyCode)}

Teslimat Adresi:
${addressText}

${bankTransfer ? "Siparişiniz ödemeniz onaylandıktan sonra" : "Siparişiniz"} 2–5 iş günü içinde kargoya verilecektir. Kargo takip bilgisi hazır olduğunda size iletilecektir.

— Es Çay`

  return { subject, html, text }
}
