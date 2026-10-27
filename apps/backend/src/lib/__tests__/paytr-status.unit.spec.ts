import { parsePaytrStatus, queryPaytrStatus } from "../paytr-status"

describe("paytr-status", () => {
  it("iadeleri Beklemede / Tamamlandı olarak ayırır", () => {
    const s = parsePaytrStatus("OID1", {
      status: "success",
      payment_amount: "2897",
      payment_total: "3130.54",
      payment_date: "07.08.2026",
      returns: [
        { return_amount: "1079.53", return_date: "2026-10-19 15:05:31", date_completed: "2026-10-19 15:06:18", return_type: "kismi_iade", reference_no: "R100a", return_source: "İade API" },
        { return_amount: "1259.3", return_date: "2026-10-19 15:18:51", reference_no: "R100b", return_source: "İade API" },
      ],
    })
    expect(s.ok).toBe(true)
    if (!s.ok) return
    expect(s.returns.map((r) => r.status)).toEqual(["completed", "pending"])
    expect(s.returned_total).toBe(2338.83)
    expect(s.payment_total).toBe(3130.54)
  })

  it("hata yanıtı", () => {
    expect(parsePaytrStatus("X", { status: "error", err_no: "005", err_msg: "bulunamadi" })).toMatchObject({
      ok: false,
      message: "005 bulunamadi",
    })
  })

  it("token id+oid+salt ile üretilir ve form gönderilir", async () => {
    process.env.PAYTR_MERCHANT_ID = "1"
    process.env.PAYTR_MERCHANT_KEY = "k"
    process.env.PAYTR_MERCHANT_SALT = "s"
    const fetchImpl = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const body = init?.body as URLSearchParams
      const crypto = require("crypto")
      const expected = crypto.createHmac("sha256", "k").update("1OID1s").digest("base64")
      expect(body.get("paytr_token")).toBe(expected)
      return new Response(JSON.stringify({ status: "success", payment_amount: "10", payment_total: "10", returns: [] }))
    })
    const s = await queryPaytrStatus("OID1", fetchImpl as unknown as typeof fetch)
    expect(s).toMatchObject({ ok: true, returns: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
