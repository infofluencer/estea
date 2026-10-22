import { computeRefundHash } from "../modules/paytr/hash"

/**
 * PayTR Durum Sorgu (POST /odeme/durum-sorgu) — salt okuma.
 * https://dev.paytr.com/durum-sorgu
 *
 * Ödeme + o siparişe yapılmış iadeler (API veya PayTR panelinden). İade satırında
 * date_completed boşsa PayTR'de "İade Beklemede" demektir (ör. parası mağazaya
 * aktarılmış eski ödemeler).
 */

export type PaytrStatusReturn = {
  amount: number
  requested_at: string | null
  completed_at: string | null
  status: "completed" | "pending"
  type: string | null
  reference_no: string | null
  source: string | null
}

export type PaytrStatusResult =
  | {
      ok: true
      merchant_oid: string
      payment_amount: number
      payment_total: number
      payment_date: string | null
      currency: string | null
      payment_type: string | null
      returns: PaytrStatusReturn[]
      returned_total: number
    }
  | { ok: false; merchant_oid: string; message: string }

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown) => (v == null || v === "" ? null : String(v))

export function parsePaytrStatus(merchantOid: string, json: Record<string, unknown>): PaytrStatusResult {
  if (json.status !== "success") {
    return {
      ok: false,
      merchant_oid: merchantOid,
      message: [json.err_no, json.err_msg].filter(Boolean).join(" ") || "PayTR durum sorgusu başarısız",
    }
  }
  const raw = Array.isArray(json.returns) ? (json.returns as Record<string, unknown>[]) : []
  const returns: PaytrStatusReturn[] = raw.map((r) => ({
    amount: num(r.return_amount),
    requested_at: str(r.return_date),
    completed_at: str(r.date_completed),
    status: r.date_completed ? "completed" : "pending",
    type: str(r.return_type),
    reference_no: str(r.reference_no),
    source: str(r.return_source),
  }))
  return {
    ok: true,
    merchant_oid: merchantOid,
    payment_amount: num(json.payment_amount),
    payment_total: num(json.payment_total),
    payment_date: str(json.payment_date),
    currency: str(json.currency),
    payment_type: str(json.odeme_tipi),
    returns,
    returned_total: Math.round(returns.reduce((s, r) => s + r.amount, 0) * 100) / 100,
  }
}

export async function queryPaytrStatus(
  merchantOid: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<PaytrStatusResult> {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() || ""
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() || ""
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() || ""
  if (!merchantId || !merchantKey || !merchantSalt) {
    return { ok: false, merchant_oid: merchantOid, message: "PAYTR_* kimlikleri eksik" }
  }
  // Durum sorgu token'ı: base64(HMAC_SHA256(merchant_id + merchant_oid + merchant_salt, merchant_key))
  // — iade hash'iyle aynı biçim, return_amount olmadan.
  const paytrToken = computeRefundHash({ merchantId, merchantOid, returnAmount: "", merchantSalt, merchantKey })
  try {
    const res = await fetchImpl("https://www.paytr.com/odeme/durum-sorgu", {
      method: "POST",
      body: new URLSearchParams({ merchant_id: merchantId, merchant_oid: merchantOid, paytr_token: paytrToken }),
    })
    const text = await res.text()
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, merchant_oid: merchantOid, message: `PayTR yanıtı JSON değil (HTTP ${res.status})` }
    }
    return parsePaytrStatus(merchantOid, json)
  } catch (err) {
    return { ok: false, merchant_oid: merchantOid, message: err instanceof Error ? err.message : String(err) }
  }
}
