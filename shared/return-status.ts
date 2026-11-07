/**
 * Müşteriye gösterilen iade / değişim durumu — hesap sayfası ve sipariş
 * detayı aynı etiketi kullanır. Kaynak: Medusa return.status + backend'in
 * return.metadata'ya yazdığı bloklar (escay_rejection, escay_exchange,
 * escay_acceptance, paytr_refund, return_code).
 */

export type ReturnStatusTone = "pending" | "progress" | "done" | "rejected" | "canceled"

export type ReturnStatusInput = {
  status?: string | null
  metadata?: Record<string, unknown> | null
}

export type ResolvedReturnStatus = {
  kind: "return" | "exchange"
  label: string
  tone: ReturnStatusTone
  /** Müşterinin bir sonraki adımı ya da durumun açıklaması */
  note: string | null
  /** Kartına iade edilen tutar (yalnız para iadesi tamamlandıysa) */
  refundAmount: number | null
  /** Admin'in müşteriye ilettiği kargo iade kodu */
  returnCode: string | null
}

type Block = Record<string, unknown>

function block(meta: Record<string, unknown> | null | undefined, key: string): Block | null {
  const value = meta?.[key]
  return value && typeof value === "object" ? (value as Block) : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function amount(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function isReturnRejected(meta: Record<string, unknown> | null | undefined): boolean {
  const rejection = block(meta, "escay_rejection")
  if (rejection) return rejection.rejected === true
  return meta?.rejected === true
}

/** Kabul sırasında reddedilen (para iadesi yapılmayan) adet var mı. */
function hasUnacceptedItems(meta: Record<string, unknown> | null | undefined): boolean {
  const items = block(meta, "escay_acceptance")?.items
  if (!Array.isArray(items)) return false
  return items.some((it) => Number((it as Block)?.rejected) > 0)
}

export function resolveReturnStatus(ret: ReturnStatusInput | null | undefined): ResolvedReturnStatus | null {
  if (!ret || (!ret.status && !ret.metadata)) return null
  const meta = ret.metadata || null
  const status = (ret.status || "").toLowerCase()
  const received = status === "received" || status === "partially_received"
  const returnCode = text(meta?.return_code)
  const awaitingParcel =
    returnCode != null
      ? `İade kodun: ${returnCode}. Paketi kargo şubesine götürüp bu kodu söyle.`
      : "İade kodun e-postayla gelecek. Kod gelmeden paketi kargoya verme."

  if (isReturnRejected(meta)) {
    const reason = text(block(meta, "escay_rejection")?.reason)
    return {
      kind: "return",
      label: "İade kabul edilmedi",
      tone: "rejected",
      note: reason
        ? `Açıklama: ${reason}`
        : "Sorunun varsa müşteri hizmetlerimize yazabilirsin.",
      refundAmount: null,
      returnCode,
    }
  }

  const exchange = block(meta, "escay_exchange")
  const exchangeStatus = text(exchange?.status)
  if (exchange && exchangeStatus && exchangeStatus !== "canceled") {
    const base = { kind: "exchange" as const, refundAmount: null, returnCode }
    if (status === "canceled") {
      return { ...base, label: "Değişim iptal edildi", tone: "canceled", note: null }
    }
    if (exchangeStatus === "shipment_created") {
      return {
        ...base,
        label: "Yeni ürün gönderiliyor",
        tone: "done",
        note: "Değişim ürününün gönderisi hazırlandı. Kargo takibini sipariş sayfasında görebilirsin.",
      }
    }
    if (received) {
      return {
        ...base,
        label: "Değişim: ürün bize ulaştı",
        tone: "progress",
        note: "Yeni ürünün hazırlanıyor, kargoya verince haber vereceğiz.",
      }
    }
    return { ...base, label: "Değişim talebi alındı", tone: "pending", note: awaitingParcel }
  }

  if (status === "canceled") {
    return {
      kind: "return",
      label: "İade iptal edildi",
      tone: "canceled",
      note: null,
      refundAmount: null,
      returnCode,
    }
  }

  const refund = block(meta, "paytr_refund")
  if (refund?.status === "success") {
    return {
      kind: "return",
      label: "Para iade edildi",
      tone: "done",
      note: hasUnacceptedItems(meta)
        ? "Bazı ürünler kabul edilmedi; kabul edilenlerin tutarı kartına iade edildi. Hesabına yansıması bankana göre birkaç gün sürebilir."
        : "Tutar kartına iade edildi. Hesabına yansıması bankana göre birkaç gün sürebilir.",
      refundAmount: amount(refund.amount),
      returnCode,
    }
  }

  if (received) {
    return {
      kind: "return",
      label: "Ürün bize ulaştı",
      tone: "progress",
      note: hasUnacceptedItems(meta)
        ? "Bazı ürünler kabul edilmedi. Kabul edilenlerin para iadesi hazırlanıyor."
        : "Para iaden hazırlanıyor, kartına geçince e-posta göndereceğiz.",
      refundAmount: null,
      returnCode,
    }
  }

  return {
    kind: "return",
    label: "İade talebi alındı",
    tone: "pending",
    note: awaitingParcel,
    refundAmount: null,
    returnCode,
  }
}
