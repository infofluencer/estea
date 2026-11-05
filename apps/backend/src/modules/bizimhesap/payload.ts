/**
 * Sipariş → addinvoice gövdesi (saf hesap, HTTP yok).
 * https://apidocs.bizimhesap.com/addinvoice
 *
 * Medusa tutarları KDV dahil; BizimHesap satırı vergisiz net + vergi ister.
 * Yuvarlama satır toplamından yapılır, böylece net + tax her satırda ve dipte
 * siparişin KDV dahil toplamına kuruşu kuruşuna eşit kalır.
 */

export type BizimhesapLineInput = {
  productId: string
  productName: string
  vatRate: number
  quantity: number
  /** KDV dahil birim fiyat */
  grossUnitPrice: number
  /** Satırın KDV dahil toplam indirimi */
  discountGross?: number
}

export type BizimhesapCustomerInput = {
  customerId: string
  title: string
  address?: string | null
  taxOffice?: string | null
  taxNo?: string | null
  email?: string | null
  phone?: string | null
}

export type BizimhesapInvoiceInput = {
  firmId: string
  invoiceNo: string
  note?: string
  invoiceDate?: Date
  currencyCode?: string | null
  customer: BizimhesapCustomerInput
  lines: BizimhesapLineInput[]
  shipping?: { grossAmount: number; vatRate: number } | null
}

export type BizimhesapPayloadDetail = {
  productId: string
  productName: string
  taxRate: string
  quantity: number
  unitPrice: string
  grossPrice: string
  discount: string
  net: string
  tax: string
  total: string
}

export type BizimhesapPayload = {
  firmId: string
  invoiceNo: string
  invoiceType: number
  note?: string
  dates: { invoiceDate: string; dueDate: string }
  customer: {
    customerId: string
    title: string
    address: string
    taxOffice?: string
    taxNo?: string
    email?: string
    phone?: string
  }
  amounts: {
    currency: string
    gross: string
    discount: string
    net: string
    tax: string
    total: string
  }
  details: BizimhesapPayloadDetail[]
}

const INVOICE_TYPE_SALE = 3
const SUPPORTED_CURRENCIES = new Set(["TL", "USD", "EUR", "CHF", "GBP"])
const SHIPPING_PRODUCT_ID = "KARGO"

export function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value != null && typeof value === "object" && "value" in value) {
    return asNumber((value as { value: unknown }).value)
  }
  if (
    value != null &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const n = Number(String(value))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** KDV dahil brüt → KDV hariç net. */
export function grossToNet(gross: number, vatRatePercent: number): number {
  const g = asNumber(gross)
  const r = asNumber(vatRatePercent)
  if (g === 0) return 0
  if (r <= 0) return roundMoney(g)
  return roundMoney(g / (1 + r / 100))
}

/**
 * Medusa tax_lines.rate → KDV %. 1 → 1 (çay), 0.1 → 10, 10 → 10, 0.2 → 20.
 * Medusa YÜZDE saklar (çay: 1 = %1); 1'in altı kesir sayılır. `r <= 1` olsaydı %1 → %100 olurdu.
 */
export function mapMedusaTaxRateToVat(rate: unknown, fallback: number): number {
  const r = asNumber(rate)
  if (r > 0) return r < 1 ? roundMoney(r * 100) : r
  return fallback
}

export function toBizimhesapCurrency(code?: string | null): string {
  const c = (code || "").trim().toUpperCase()
  const mapped = !c || c === "TRY" || c === "TRL" ? "TL" : c
  if (!SUPPORTED_CURRENCIES.has(mapped)) {
    throw new Error(`BizimHesap para birimi desteklemiyor: ${code}`)
  }
  return mapped
}

/** "2026-11-03T18:45:52.516+03:00" — dokümandaki biçim; Türkiye sabit UTC+3. */
export function formatBizimhesapDate(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000)
    .toISOString()
    .replace("Z", "+03:00")
}

// Dokümandaki örnek "2,400.00" ile "1200.00"yi karıştırıyor; binlik ayraçsız ve noktalı yazılır.
function fmt(n: number, digits = 2): string {
  return n.toFixed(digits)
}

function buildDetail(input: BizimhesapLineInput): {
  detail: BizimhesapPayloadDetail
  sums: { gross: number; discount: number; net: number; tax: number; total: number }
} {
  const quantity = input.quantity
  const lineGrossInclVat = roundMoney(input.grossUnitPrice * quantity)
  const discountInclVat = Math.min(
    roundMoney(asNumber(input.discountGross)),
    lineGrossInclVat
  )
  const total = roundMoney(lineGrossInclVat - discountInclVat)
  const net = grossToNet(total, input.vatRate)
  const tax = roundMoney(total - net)
  const gross = grossToNet(lineGrossInclVat, input.vatRate)
  const discount = roundMoney(gross - net)

  return {
    detail: {
      productId: input.productId,
      productName: input.productName,
      taxRate: fmt(input.vatRate),
      quantity,
      // Vergisiz birim 2 haneye sığmaz (35 / 1,01); brüt satır toplamıyla tutarlı kalsın.
      unitPrice: fmt(gross / quantity, 4),
      grossPrice: fmt(gross),
      discount: fmt(discount),
      net: fmt(net),
      tax: fmt(tax),
      total: fmt(total),
    },
    sums: { gross, discount, net, tax, total },
  }
}

export function buildAddInvoicePayload(input: BizimhesapInvoiceInput): {
  payload: BizimhesapPayload
  total: number
} {
  const lineInputs = [...input.lines]
  if (input.shipping && input.shipping.grossAmount > 0) {
    lineInputs.push({
      productId: SHIPPING_PRODUCT_ID,
      productName: "Kargo",
      vatRate: input.shipping.vatRate,
      quantity: 1,
      grossUnitPrice: input.shipping.grossAmount,
    })
  }
  if (!lineInputs.length) {
    throw new Error("Fatura satırı yok")
  }

  const built = lineInputs.map(buildDetail)
  const sum = (key: keyof (typeof built)[number]["sums"]) =>
    roundMoney(built.reduce((s, b) => s + b.sums[key], 0))
  const total = sum("total")
  const date = formatBizimhesapDate(input.invoiceDate ?? new Date())
  const c = input.customer

  return {
    total,
    payload: {
      firmId: input.firmId,
      invoiceNo: input.invoiceNo,
      invoiceType: INVOICE_TYPE_SALE,
      ...(input.note ? { note: input.note } : {}),
      dates: { invoiceDate: date, dueDate: date },
      customer: {
        customerId: c.customerId,
        title: c.title,
        address: c.address || "",
        ...(c.taxOffice ? { taxOffice: c.taxOffice } : {}),
        ...(c.taxNo ? { taxNo: c.taxNo } : {}),
        ...(c.email ? { email: c.email } : {}),
        ...(c.phone ? { phone: c.phone } : {}),
      },
      amounts: {
        currency: toBizimhesapCurrency(input.currencyCode),
        gross: fmt(sum("gross")),
        discount: fmt(sum("discount")),
        net: fmt(sum("net")),
        tax: fmt(sum("tax")),
        total: fmt(total),
      },
      details: built.map((b) => b.detail),
    },
  }
}
