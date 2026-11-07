import { describe, expect, it } from "vitest"
import { resolveReturnStatus } from "@escay/shared/return-status"

describe("resolveReturnStatus", () => {
  it("iade yoksa null", () => {
    expect(resolveReturnStatus(null)).toBeNull()
    expect(resolveReturnStatus({})).toBeNull()
  })

  it("talep: kod yoksa kod beklenir, varsa kod gösterilir", () => {
    expect(resolveReturnStatus({ status: "requested" })).toMatchObject({
      label: "İade talebi alındı",
      tone: "pending",
      returnCode: null,
    })
    const withCode = resolveReturnStatus({ status: "requested", metadata: { return_code: "YK-1" } })
    expect(withCode?.returnCode).toBe("YK-1")
    expect(withCode?.note).toContain("YK-1")
  })

  it("red, durumdan ve para iadesinden önce gelir; sebep gösterilir", () => {
    const st = resolveReturnStatus({
      status: "canceled",
      metadata: {
        escay_rejection: { rejected: true, reason: "Ürün açılmış" },
        paytr_refund: { status: "skipped" },
      },
    })
    expect(st).toMatchObject({ label: "İade kabul edilmedi", tone: "rejected" })
    expect(st?.note).toBe("Açıklama: Ürün açılmış")
  })

  it("değişim, iade gibi görünmez", () => {
    const exchange = (status: string) => ({ escay_exchange: { status, items: [] } })
    expect(resolveReturnStatus({ status: "requested", metadata: exchange("requested") })?.label).toBe(
      "Değişim talebi alındı"
    )
    expect(resolveReturnStatus({ status: "received", metadata: exchange("requested") })?.label).toBe(
      "Değişim: ürün bize ulaştı"
    )
    expect(resolveReturnStatus({ status: "received", metadata: exchange("shipment_created") })).toMatchObject({
      kind: "exchange",
      label: "Yeni ürün gönderiliyor",
    })
    // İptal edilen değişim normal iadeye döner
    expect(resolveReturnStatus({ status: "received", metadata: exchange("canceled") })?.kind).toBe("return")
  })

  it("para iadesi: tutar ve kısmi kabul notu", () => {
    const st = resolveReturnStatus({
      status: "partially_received",
      metadata: {
        paytr_refund: { status: "success", amount: 1800 },
        escay_acceptance: { items: [{ rejected: 1 }] },
      },
    })
    expect(st).toMatchObject({ label: "Para iade edildi", tone: "done", refundAmount: 1800 })
    expect(st?.note).toContain("Bazı ürünler kabul edilmedi")
  })

  it("teslim alındı, para iadesi henüz yoksa işleniyor", () => {
    expect(
      resolveReturnStatus({ status: "received", metadata: { paytr_refund: { status: "failed" } } })
    ).toMatchObject({ label: "Ürün bize ulaştı", tone: "progress", refundAmount: null })
  })
})
