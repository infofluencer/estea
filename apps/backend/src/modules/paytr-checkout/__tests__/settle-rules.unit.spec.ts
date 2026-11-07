import {
  currencyMatches,
  decideSettlement,
  isPollDue,
  itemsSignature,
  normalizePaytrCurrency,
  type SettleInput,
} from "../settle-rules"

const base: SettleInput = {
  status: "pending",
  amountMatches: true,
  currencyMatches: true,
  cartExists: true,
  cartOrderId: null,
  cartOrderCanceled: false,
  sessionAlive: true,
  cartAmountMatches: true,
  itemsMatch: true,
}

describe("decideSettlement", () => {
  it("normal ödeme → sipariş oluştur", () => {
    expect(decideSettlement(base)).toEqual({ action: "complete", adopt: false })
  })

  it("para birimi tutmuyor → elle inceleme (tutar kontrolünden önce)", () => {
    expect(decideSettlement({ ...base, currencyMatches: false, amountMatches: false })).toEqual({
      action: "review",
      kind: "currency_mismatch",
    })
  })

  it("sipariş açılmış ama iptal edilmiş → tahsilat yazılmaz, elle inceleme", () => {
    expect(
      decideSettlement({ ...base, cartOrderId: "order_1", cartOrderCanceled: true, sessionAlive: true })
    ).toEqual({ action: "review", kind: "order_canceled" })
    expect(
      decideSettlement({ ...base, cartOrderId: "order_1", cartOrderCanceled: true, sessionAlive: false })
    ).toEqual({ action: "review", kind: "order_canceled" })
  })

  it("süresi dolmuş denemeye geç gelen ödeme de işlenir", () => {
    expect(decideSettlement({ ...base, status: "expired" })).toEqual({ action: "complete", adopt: false })
  })

  it("oturum silinmiş, sepet aynı → aynı numarayla oturum açılıp sipariş oluşur", () => {
    expect(decideSettlement({ ...base, sessionAlive: false })).toEqual({ action: "complete", adopt: true })
  })

  it("sepet değişmiş → elle inceleme, sipariş açılmaz", () => {
    for (const change of [{ cartAmountMatches: false }, { itemsMatch: false }, { cartExists: false }]) {
      expect(decideSettlement({ ...base, sessionAlive: false, ...change })).toEqual({
        action: "review",
        kind: "cart_changed",
      })
    }
  })

  it("sepet başka numarayla ödenmiş → çift ödeme uyarısı, ikinci sipariş yok", () => {
    expect(decideSettlement({ ...base, cartOrderId: "order_1", sessionAlive: false })).toEqual({
      action: "review",
      kind: "duplicate_payment",
    })
  })

  it("sipariş bu ödemeden oluşmuş, tahsilat eksik → yalnız tahsilat", () => {
    expect(decideSettlement({ ...base, status: "paid", cartOrderId: "order_1" })).toEqual({ action: "capture" })
  })

  it("tutar tutmuyor → elle inceleme", () => {
    expect(decideSettlement({ ...base, amountMatches: false })).toEqual({ action: "review", kind: "amount_mismatch" })
  })

  it("sonuçlanmış deneme tekrar işlenmez", () => {
    for (const status of ["completed", "review", "refunded"] as const) {
      expect(decideSettlement({ ...base, status })).toEqual({ action: "noop" })
    }
  })
})

describe("itemsSignature", () => {
  it("sıra ve satır bölünmesi fark etmez, adet fark eder", () => {
    const a = itemsSignature([{ variant_id: "v1", quantity: 2 }, { variant_id: "v2", quantity: 1 }])
    expect(itemsSignature([{ variant_id: "v2", quantity: 1 }, { variant_id: "v1", quantity: 1 }, { variant_id: "v1", quantity: 1 }])).toBe(a)
    expect(itemsSignature([{ variant_id: "v1", quantity: 3 }, { variant_id: "v2", quantity: 1 }])).not.toBe(a)
  })
})

describe("isPollDue", () => {
  const now = new Date("2026-11-05T12:00:00Z")
  const ago = (ms: number) => new Date(now.getTime() - ms)
  const MIN = 60_000
  const HOUR = 60 * MIN

  it("ilk dakikalarda callback'e yol verir", () => {
    expect(isPollDue(ago(MIN), null, now)).toBe(false)
  })
  it("ilk 2 saat her tur sorar", () => {
    expect(isPollDue(ago(30 * MIN), ago(5 * MIN), now)).toBe(true)
  })
  it("sonra saatte bir sorar", () => {
    expect(isPollDue(ago(5 * HOUR), ago(10 * MIN), now)).toBe(false)
    expect(isPollDue(ago(5 * HOUR), ago(61 * MIN), now)).toBe(true)
  })
  it("48 saatten sonra sormaz", () => {
    expect(isPollDue(ago(49 * HOUR), null, now)).toBe(false)
  })
})

describe("para birimi", () => {
  it("PayTR TL/TRY/TRL → try; boş → bilinmiyor", () => {
    expect(normalizePaytrCurrency("TL")).toBe("try")
    expect(normalizePaytrCurrency("try")).toBe("try")
    expect(normalizePaytrCurrency(" TRL ")).toBe("try")
    expect(normalizePaytrCurrency("USD")).toBe("usd")
    expect(normalizePaytrCurrency("")).toBeNull()
    expect(normalizePaytrCurrency(undefined)).toBeNull()
  })

  it("bildirim birim vermediyse eşleşmiş sayılır; USD ödeme TRY denemeye uymaz", () => {
    expect(currencyMatches(null, "try")).toBe(true)
    expect(currencyMatches("TL", "try")).toBe(true)
    expect(currencyMatches("TL", undefined)).toBe(true)
    expect(currencyMatches("USD", "try")).toBe(false)
    expect(currencyMatches("EUR", "eur")).toBe(true)
  })
})
