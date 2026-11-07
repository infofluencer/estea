import PaytrProviderService from "../service"
import { computeAdoptToken } from "../hash"

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }

function provider() {
  return new PaytrProviderService({ logger } as never, {
    merchantId: "m",
    merchantKey: "k",
    merchantSalt: "s",
    testMode: "1",
  })
}

describe("PayTR provider: sipariş yalnız ödeme başarılıysa", () => {
  const prev = { ...process.env }

  beforeEach(() => {
    process.env.PAYTR_MOCK = ""
    process.env.PAYTR_MERCHANT_KEY = "k"
    process.env.PAYTR_MERCHANT_SALT = "s"
  })
  afterAll(() => {
    process.env = prev
  })

  it("ödenmemiş gerçek oturumla sepet tamamlama reddedilir", async () => {
    const res = await provider().authorizePayment({
      data: { merchant_oid: "M1", paytr_status: "pending" },
    } as never)
    expect(res.status).toBe("requires_more")
  })

  it("ödenmiş oturum yetkilendirilir", async () => {
    const res = await provider().authorizePayment({
      data: { merchant_oid: "M1", paytr_status: "success" },
    } as never)
    expect(res.status).toBe("authorized")
  })

  it("stub oturum yerel test için eski yolda kalır", async () => {
    const res = await provider().authorizePayment({
      data: { merchant_oid: "M1", paytr_status: "pending", _stub: true },
    } as never)
    expect(res.status).toBe("pending_authorization")
  })

  it("mağaza API'sinden gelen paytr_status dikkate alınmaz", async () => {
    process.env.PAYTR_MOCK = "1"
    const res = await provider().initiatePayment({
      amount: 100,
      currency_code: "try",
      data: { paytr_status: "success", callback_processed: true },
    } as never)
    expect((res.data as Record<string, unknown>).paytr_status).toBe("pending")
  })

  it("imzasız oturum devri reddedilir", async () => {
    await expect(
      provider().initiatePayment({
        amount: 100,
        currency_code: "try",
        data: { adopt_merchant_oid: "M1", adopt_token: "sahte" },
      } as never)
    ).rejects.toThrow(/Geçersiz/)
    await expect(
      provider().initiatePayment({
        amount: 100,
        currency_code: "try",
        data: { adopt_merchant_oid: "M1" },
      } as never)
    ).rejects.toThrow(/Geçersiz/)
  })

  it("imzalı devir aynı numarayla, ödenmemiş olarak açılır", async () => {
    const res = await provider().initiatePayment({
      amount: 100,
      currency_code: "try",
      data: { adopt_merchant_oid: "M1", adopt_token: computeAdoptToken("M1") },
    } as never)
    const data = res.data as Record<string, unknown>
    expect(data.merchant_oid).toBe("M1")
    expect(data.paytr_status).toBe("pending")
    expect(data._stub).toBeUndefined()
  })
})
