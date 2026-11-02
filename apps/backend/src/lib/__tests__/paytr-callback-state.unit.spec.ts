import {
  callbackAutoRefundEnabled,
  isCallbackSettled,
  isRetryingSince,
  manualReviewStatusFor,
  nextFailedAttemptData,
} from "../../modules/paytr/callback-state"

describe("paytr callback-state", () => {
  describe("nextFailedAttemptData", () => {
    it("ilk failed'da sayaç 1, sebep ve zaman yazar; callback_processed YAZMAZ", () => {
      const now = new Date("2026-10-30T10:00:00.000Z")
      const next = nextFailedAttemptData(
        { merchant_oid: "M1", paytr_status: "pending" },
        { code: "6", msg: "3D Secure başarısız" },
        now
      )
      expect(next.paytr_failed_attempts).toBe(1)
      expect(next.paytr_last_failed_at).toBe(now.toISOString())
      expect(next.failed_reason).toBe("6 3D Secure başarısız")
      expect(next.callback_processed).toBeUndefined()
      // success yolu bozulmasın: paytr_status pending kalır
      expect(next.paytr_status).toBe("pending")
      expect(next.merchant_oid).toBe("M1")
    })

    it("tekrar failed'da sayacı artırır (aynı merchant_oid ile 3DS tekrar denemesi)", () => {
      const first = nextFailedAttemptData({}, { code: "6", msg: "x" })
      const second = nextFailedAttemptData(first, { code: "7", msg: "y" })
      expect(second.paytr_failed_attempts).toBe(2)
      expect(second.failed_reason).toBe("7 y")
    })

    it("sebep boşsa 'bilinmiyor' yazar; önceki bozuk sayaç 0 kabul edilir", () => {
      const next = nextFailedAttemptData(
        { paytr_failed_attempts: "abc" },
        { code: "", msg: null }
      )
      expect(next.paytr_failed_attempts).toBe(1)
      expect(next.failed_reason).toBe("bilinmiyor")
    })
  })

  describe("isCallbackSettled", () => {
    it("callback_processed ya da manual_review true ise sonuçlanmış sayar", () => {
      expect(isCallbackSettled({ callback_processed: true })).toBe(true)
      expect(isCallbackSettled({ manual_review: true })).toBe(true)
      expect(isCallbackSettled({ paytr_failed_attempts: 3 })).toBe(false)
      expect(isCallbackSettled(null)).toBe(false)
    })
  })

  describe("isRetryingSince", () => {
    const cutoff = new Date("2026-10-30T10:00:00.000Z")

    it("son failed eşiğin içindeyse true (temizlik beklesin)", () => {
      expect(
        isRetryingSince({ paytr_last_failed_at: "2026-10-30T10:05:00.000Z" }, cutoff)
      ).toBe(true)
    })

    it("son failed eşikten eskiyse false (temizlik iptal edebilir)", () => {
      expect(
        isRetryingSince({ paytr_last_failed_at: "2026-10-30T09:00:00.000Z" }, cutoff)
      ).toBe(false)
    })

    it("alan yoksa / bozuksa false", () => {
      expect(isRetryingSince({}, cutoff)).toBe(false)
      expect(isRetryingSince({ paytr_last_failed_at: "bugün" }, cutoff)).toBe(false)
      expect(isRetryingSince(undefined, cutoff)).toBe(false)
    })
  })

  describe("manualReviewStatusFor", () => {
    it("her anomali türüne ayrı durum verir, hiçbiri 'success' değildir", () => {
      const kinds = ["late_success_canceled", "amount_mismatch", "success_no_order"] as const
      const statuses = kinds.map(manualReviewStatusFor)
      expect(new Set(statuses).size).toBe(3)
      for (const s of statuses) expect(s).not.toBe("success")
    })
  })

  describe("callbackAutoRefundEnabled", () => {
    it("varsayılan kapalı; yalnızca PAYTR_CALLBACK_AUTO_REFUND=1 ile açılır", () => {
      expect(callbackAutoRefundEnabled({})).toBe(false)
      expect(callbackAutoRefundEnabled({ PAYTR_CALLBACK_AUTO_REFUND: "0" })).toBe(false)
      expect(callbackAutoRefundEnabled({ PAYTR_CALLBACK_AUTO_REFUND: "1" })).toBe(true)
      // eski ad artık etkisiz
      expect(callbackAutoRefundEnabled({ PAYTR_LATE_SUCCESS_AUTO_REFUND: "1" })).toBe(false)
    })
  })
})
