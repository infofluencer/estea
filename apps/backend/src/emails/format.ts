/** Format amount in TRY (major units, same as storefront formatTry). */
export function formatMoney(
  amount: number | string | null | undefined,
  currencyCode = "TRY"
): string {
  const value = typeof amount === "string" ? Number(amount) : amount ?? 0
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value)
}

/** Kuruşlu tutar — havale gibi müşterinin birebir yazacağı yerler için. */
export function formatMoneyExact(
  amount: number | string | null | undefined,
  currencyCode = "TRY"
): string {
  const value = typeof amount === "string" ? Number(amount) : amount ?? 0
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Coerce Medusa BigNumber / numeric fields for email templates. */
export function coerceAmount(value: unknown): number | string | null {
  if (value == null) {
    return null
  }
  if (typeof value === "number" || typeof value === "string") {
    return value
  }
  if (typeof value === "object" && "toString" in value) {
    return String(value)
  }
  return null
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function formatAddress(address: {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
} | null | undefined): string {
  if (!address) {
    return "—"
  }

  const lines: string[] = []
  const name = [address.first_name, address.last_name].filter(Boolean).join(" ")
  if (name) {
    lines.push(name)
  }
  if (address.address_1) {
    lines.push(address.address_1)
  }
  if (address.address_2) {
    lines.push(address.address_2)
  }
  const cityLine = [address.postal_code, address.city, address.province]
    .filter(Boolean)
    .join(" ")
  if (cityLine) {
    lines.push(cityLine)
  }
  if (address.country_code) {
    lines.push(address.country_code.toUpperCase())
  }
  if (address.phone) {
    lines.push(`Tel: ${address.phone}`)
  }

  return lines.length ? lines.join("\n") : "—"
}

export const EMAIL_STYLES = {
  // Es Çay paleti (packages/ui/theme.css): brand #b43317, garden-dark #355c0c
  brandColor: "#355c0c",
  accentColor: "#b43317",
  mutedColor: "#666666",
  borderColor: "#eaeaea",
  bgColor: "#f9f9f9",
}

/** Logo (şeffaf PNG) — storefront public/email/escay-logo.png. STOREFRONT_URL her zaman set edilmeli. */
const EMAIL_LOGO_URL = `${(process.env.STOREFRONT_URL || "http://localhost:3025").replace(/\/$/, "")}/email/escay-logo.png`

export function emailLayout(content: string): string {
  const { brandColor, borderColor, bgColor } = EMAIL_STYLES
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Es Çay</title>
</head>
<body style="margin:0;padding:0;background-color:${bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${bgColor};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${borderColor};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;text-align:center;background-color:${brandColor};">
              <img src="${EMAIL_LOGO_URL}" width="150" height="80" alt="ES ÇAY" style="display:inline-block;width:150px;height:auto;max-width:150px;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:24px;font-weight:600;letter-spacing:2px;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background-color:${bgColor};border-top:1px solid ${borderColor};text-align:center;">
              <p style="margin:0;font-size:12px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
                © Es Çay — Hamzalı Çay Gıda Tur. ve İnş. A.Ş. — info@esteacay.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
