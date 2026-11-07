import { beforeEach, describe, expect, it, vi } from "vitest"

const sdk = vi.hoisted(() => ({
  client: { fetch: vi.fn() },
  store: { payment: { initiatePaymentSession: vi.fn() } },
}))
vi.mock("../medusa", () => ({ sdk }))

import {
  BANK_TRANSFER_PAYMENT_PROVIDER_ID,
  PAYTR_PAYMENT_PROVIDER_ID,
  fetchBankTransferInfo,
  initiateBankTransferPayment,
  initiatePaytrPayment,
} from "../payment"

const sessionResult = (data: Record<string, unknown>) => ({
  payment_collection: { payment_sessions: [{ data }] },
})

const cart = {
  id: "cart_1",
  email: "ayse@gmail.com",
  total: 199.8,
  shipping_total: 49.9,
  items: [
    { id: "li_1", title: "Rize Turist", quantity: 2, unit_price: 74.95, variant: { title: "500 g" } },
  ],
  shipping_address: {
    first_name: "Ayşe",
    last_name: "Yılmaz",
    address_1: "Uzun Sk. No:12",
    city: "Trabzon",
    postal_code: "61030",
    phone: "+905551112233",
  },
}

function sentData() {
  const call = sdk.store.payment.initiatePaymentSession.mock.calls.at(-1)!
  return call[1] as { provider_id: string; data: Record<string, unknown> }
}

beforeEach(() => {
  sdk.client.fetch.mockReset()
  sdk.store.payment.initiatePaymentSession.mockReset()
  sdk.store.payment.initiatePaymentSession.mockResolvedValue(
    sessionResult({ iframe_token: "tok_abcdefgh", session_id: "ps_1" })
  )
})

describe("initiatePaytrPayment", () => {
  it("sepet kalemleri + kargo; toplam tutarla eşleşirse ayrı satırlar", async () => {
    const r = await initiatePaytrPayment(cart, { Authorization: "Bearer t" }, "85.1.2.3")
    expect(r).toEqual({ provider: "paytr", iframeToken: "tok_abcdefgh", sessionId: "ps_1" })
    const call = sdk.store.payment.initiatePaymentSession.mock.calls[0]
    expect(call[0]).toBe(cart)
    expect(call[3]).toEqual({ Authorization: "Bearer t" })
    expect(sentData()).toEqual({
      provider_id: PAYTR_PAYMENT_PROVIDER_ID,
      data: {
        customer_email: "ayse@gmail.com",
        first_name: "Ayşe",
        last_name: "Yılmaz",
        phone: "+905551112233",
        address: "Uzun Sk. No:12, Trabzon, 61030",
        cart_items: [
          { name: "Rize Turist — 500 g", unit_price: 74.95, quantity: 2 },
          { name: "Kargo", unit_price: 49.9, quantity: 1 },
        ],
        user_ip: "85.1.2.3",
      },
    })
  })

  it("indirimli sepet: sepet toplamı ≠ total → tek 'Sipariş' satırı (PayTR tutar eşleşmesi)", async () => {
    await initiatePaytrPayment({ ...cart, total: 179.82 })
    expect(sentData().data.cart_items).toEqual([{ name: "Sipariş", unit_price: 179.82, quantity: 1 }])
  })

  it("2 kuruşa kadar fark tolere edilir", async () => {
    await initiatePaytrPayment({ ...cart, total: 199.82 })
    expect(sentData().data.cart_items).toHaveLength(2)
    await initiatePaytrPayment({ ...cart, total: 199.83 })
    expect(sentData().data.cart_items).toHaveLength(1)
  })

  it("ücretsiz kargoda Kargo satırı eklenmez", async () => {
    await initiatePaytrPayment({ ...cart, shipping_total: 0, total: 149.9 })
    expect(sentData().data.cart_items).toEqual([
      { name: "Rize Turist — 500 g", unit_price: 74.95, quantity: 2 },
    ])
  })

  it("total 0/yoksa kalemler olduğu gibi gider", async () => {
    await initiatePaytrPayment({ ...cart, total: null })
    expect(sentData().data.cart_items).toHaveLength(2)
  })

  it("adres yoksa 'Türkiye', eksik alanlar undefined", async () => {
    await initiatePaytrPayment({ id: "cart_2", items: null, shipping_address: null })
    expect(sentData().data).toEqual({
      customer_email: undefined,
      first_name: undefined,
      last_name: undefined,
      phone: undefined,
      address: "Türkiye",
      cart_items: [],
      user_ip: undefined,
    })
  })

  it("varyant başlığı yoksa yalnız ürün adı; eksik fiyat 0, eksik adet 1", async () => {
    await initiatePaytrPayment({
      id: "c",
      items: [{ id: "x", title: "Yeşil Çay", quantity: 0, unit_price: null, variant: null }],
    })
    expect(sentData().data.cart_items).toEqual([{ name: "Yeşil Çay", unit_price: 0, quantity: 1 }])
  })

  it("oturumda token yoksa iframeToken null", async () => {
    sdk.store.payment.initiatePaymentSession.mockResolvedValue({ payment_collection: { payment_sessions: [] } })
    expect(await initiatePaytrPayment(cart)).toEqual({ provider: "paytr", iframeToken: null, sessionId: undefined })
  })

  it("SDK hatası yukarı fırlatılır", async () => {
    sdk.store.payment.initiatePaymentSession.mockRejectedValue(new Error("PayTR kapalı"))
    await expect(initiatePaytrPayment(cart)).rejects.toThrow("PayTR kapalı")
  })
})

describe("havale / EFT", () => {
  it("bilgi: kapalı, IBAN/hesap adı eksik veya hata → null", async () => {
    sdk.client.fetch.mockResolvedValueOnce({ enabled: false, iban: "TR00", account_name: "A" })
    expect(await fetchBankTransferInfo()).toBeNull()
    sdk.client.fetch.mockResolvedValueOnce({ enabled: true, account_name: "A" })
    expect(await fetchBankTransferInfo()).toBeNull()
    sdk.client.fetch.mockResolvedValueOnce({ enabled: true, iban: "TR00" })
    expect(await fetchBankTransferInfo()).toBeNull()
    sdk.client.fetch.mockRejectedValueOnce(new Error("ağ"))
    expect(await fetchBankTransferInfo()).toBeNull()
  })

  it("bilgi: açık → banka adı yoksa boş string", async () => {
    sdk.client.fetch.mockResolvedValueOnce({
      enabled: true,
      iban: "TR330006100519786457841326",
      account_name: "Hamzalı Çay A.Ş.",
    })
    expect(await fetchBankTransferInfo()).toEqual({
      bank_name: "",
      account_name: "Hamzalı Çay A.Ş.",
      iban: "TR330006100519786457841326",
    })
    expect(sdk.client.fetch).toHaveBeenCalledWith("/store/bank-transfer", { method: "GET" })
  })

  it("ödeme oturumu havale sağlayıcısıyla açılır", async () => {
    const c = { id: "cart_1", payment_collection: { id: "pc_1" } }
    await initiateBankTransferPayment(c, { Authorization: "Bearer t" })
    expect(sdk.store.payment.initiatePaymentSession).toHaveBeenCalledWith(
      c,
      { provider_id: BANK_TRANSFER_PAYMENT_PROVIDER_ID },
      undefined,
      { Authorization: "Bearer t" }
    )
    expect(BANK_TRANSFER_PAYMENT_PROVIDER_ID).toBe("pp_havale_havale")
    expect(PAYTR_PAYMENT_PROVIDER_ID).toBe("pp_paytr_paytr")
  })
})
