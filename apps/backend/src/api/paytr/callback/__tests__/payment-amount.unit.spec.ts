import { pickCallbackPaymentAmount } from "../../../../modules/paytr/callback-state"

describe("pickCallbackPaymentAmount", () => {
  it("geçerli payment_amount (kuruş tamsayı, total'ı aşmıyor) kullanılır", () => {
    expect(pickCallbackPaymentAmount("19990", "19990")).toBe("19990")
    // Taksit/vade farkı: total daha büyük, sipariş tutarı payment_amount
    expect(pickCallbackPaymentAmount("19990", "21500")).toBe("19990")
    expect(pickCallbackPaymentAmount(" 19990 ", "21500")).toBe("19990")
  })

  it("imzasız alan bozuksa imzalı total_amount'a dönülür", () => {
    expect(pickCallbackPaymentAmount(undefined, "19990")).toBe("19990")
    expect(pickCallbackPaymentAmount("", "19990")).toBe("19990")
    expect(pickCallbackPaymentAmount("199.90", "19990")).toBe("19990")
    expect(pickCallbackPaymentAmount("abc", "19990")).toBe("19990")
    expect(pickCallbackPaymentAmount("0", "19990")).toBe("19990")
    expect(pickCallbackPaymentAmount("-5", "19990")).toBe("19990")
  })

  it("payment_amount total'dan büyükse güvenilmez, total kullanılır", () => {
    expect(pickCallbackPaymentAmount("99999999", "19990")).toBe("19990")
  })
})
