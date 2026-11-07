import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => {
  const store = new Map<string, string>()
  const jar = {
    store,
    get: (k: string) => (store.has(k) ? { name: k, value: store.get(k)! } : undefined),
    set: vi.fn((k: string, v: string) => void store.set(k, v)),
    delete: vi.fn((k: string) => void store.delete(k)),
  }
  const reqHeaders = new Map<string, string>()
  const sdk = {
    client: { fetch: vi.fn() },
    store: {
      cart: {
        retrieve: vi.fn(),
        update: vi.fn(),
        complete: vi.fn(),
        addShippingMethod: vi.fn(),
        addPromotions: vi.fn(),
        removePromotions: vi.fn(),
        createLineItem: vi.fn(),
        create: vi.fn(),
        transferCart: vi.fn(),
      },
      fulfillment: { listCartOptions: vi.fn(), calculate: vi.fn() },
      payment: { initiatePaymentSession: vi.fn() },
      customer: { retrieve: vi.fn() },
    },
  }
  return {
    jar,
    reqHeaders,
    sdk,
    emailOk: vi.fn(async () => true),
    redirect: vi.fn((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` })
    }),
  }
})

vi.mock("next/headers", () => ({
  cookies: async () => h.jar,
  headers: async () => ({ get: (k: string) => h.reqHeaders.get(k) ?? null }),
}))
vi.mock("next/navigation", () => ({ redirect: h.redirect }))
vi.mock("../email-domain", () => ({ emailDomainAcceptsMail: h.emailOk }))
vi.mock("../medusa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../medusa")>()),
  sdk: h.sdk,
}))

import {
  applyPromoCodeAction,
  applyShippingOptionAction,
  completeCheckoutAction,
  listShippingOptionsAction,
  pollPaytrCheckoutAction,
  removePromoCodeAction,
  saveCheckoutContactAction,
  type AddressInput,
} from "../checkout-actions"

const CART = "_escay_cart_id"
const AUTH = "_escay_jwt"
const PENDING = "_escay_pending_checkout"

const address: AddressInput = {
  first_name: "Ayşe",
  last_name: "Yılmaz",
  address_1: "Uzun Sk. No:12 D:3",
  city: "Trabzon",
  district: "Ortahisar",
  neighbourhood: "Kemerkaya",
  postal_code: "61030",
  phone: "0555 111 22 33",
  tckn: "10000000146",
}

const cartRow = {
  id: "cart_1",
  email: "ayse@gmail.com",
  metadata: { utm_source: "ig" },
  items: [
    { id: "li_1", variant_id: "var_1", quantity: 2 },
    { id: "li_2", variant_id: null, quantity: 1 },
  ],
}

function resetAll() {
  h.jar.store.clear()
  h.reqHeaders.clear()
  vi.clearAllMocks()
  h.emailOk.mockResolvedValue(true)
  h.sdk.store.cart.retrieve.mockResolvedValue({ cart: cartRow })
  h.sdk.store.cart.update.mockResolvedValue({ cart: cartRow })
}

beforeEach(() => {
  resetAll()
  h.jar.store.set(CART, "cart_1")
})

describe("saveCheckoutContactAction", () => {
  it.each(["", "  ", "ayse.gmail.com"])("geçersiz e-posta %j", async (email) => {
    expect(await saveCheckoutContactAction({ email, address })).toEqual({
      ok: false,
      message: "Geçerli bir email girin.",
    })
    expect(h.emailOk).not.toHaveBeenCalled()
  })

  it("olmayan alan adı → email_domain kodu", async () => {
    h.emailOk.mockResolvedValue(false)
    const r = await saveCheckoutContactAction({ email: "ayse@gmail.con", address })
    expect(r).toMatchObject({ ok: false, code: "email_domain" })
    expect(r.ok === false && r.message).toContain('"gmail.con"')
    expect(h.sdk.store.cart.update).not.toHaveBeenCalled()
  })

  it("adres hatası mesajı iletilir", async () => {
    expect(
      await saveCheckoutContactAction({ email: "a@b.com", address: { ...address, postal_code: "123" } })
    ).toEqual({ ok: false, message: "Posta kodu 5 haneli olmalıdır." })
  })

  it("sepet çerezi yoksa hata", async () => {
    h.jar.store.delete(CART)
    expect(await saveCheckoutContactAction({ email: "a@b.com", address })).toEqual({
      ok: false,
      message: "Sepet bulunamadı. Önce ürün ekleyin.",
    })
  })

  it("aynı fatura adresi: shipping + billing(meta) + sepet metadata birleşir", async () => {
    h.jar.store.set(AUTH, "jwt_1")
    const r = await saveCheckoutContactAction({
      email: " ayse@gmail.com ",
      address,
      marketingConsent: true,
      orderNote: `  ${"x".repeat(600)}  `,
    })
    expect(r).toEqual({ ok: true })
    const [cartId, body, , headers] = h.sdk.store.cart.update.mock.calls[0]
    expect(cartId).toBe("cart_1")
    expect(headers).toEqual({ Authorization: "Bearer jwt_1" })
    expect(body.email).toBe("ayse@gmail.com")
    expect(body.shipping_address).toEqual({
      first_name: "Ayşe",
      last_name: "Yılmaz",
      address_1: "Uzun Sk. No:12 D:3",
      address_2: "Kemerkaya",
      city: "Trabzon",
      postal_code: "61030",
      country_code: "tr",
      phone: "+905551112233",
      metadata: { district: "Ortahisar", neighbourhood: "Kemerkaya", city_code: "61", email: "ayse@gmail.com" },
    })
    expect(body.billing_address.metadata).toEqual({
      district: "Ortahisar",
      neighbourhood: "Kemerkaya",
      city_code: "61",
      invoice_type: "individual",
      email: "ayse@gmail.com",
      tckn: "10000000146",
    })
    expect(body.metadata).toEqual({
      utm_source: "ig",
      marketing_consent: true,
      tracking_consent: false,
      order_note: "x".repeat(500),
    })
  })

  it("boş sipariş notu null yazılır", async () => {
    await saveCheckoutContactAction({ email: "a@b.com", address, orderNote: "   " })
    expect(h.sdk.store.cart.update.mock.calls[0][1].metadata.order_note).toBeNull()
  })

  it("farklı fatura adresi istenip verilmezse hata", async () => {
    expect(
      await saveCheckoutContactAction({ email: "a@b.com", address, useDifferentBillingAddress: true })
    ).toEqual({ ok: false, message: "Farklı fatura adresi için adres bilgilerini doldurun." })
  })

  it("farklı fatura adresi: kurumsal kimlik teslimat formundan taşınır", async () => {
    const corp: AddressInput = {
      ...address,
      tckn: undefined,
      invoice_type: "corporate",
      vkn: "1234567890",
      tax_office: "Uzun",
      company_name: "Es Çay A.Ş.",
    }
    const billingAddress: AddressInput = {
      ...address,
      tckn: undefined,
      city: "İstanbul",
      district: "Kadıköy",
      neighbourhood: "Moda",
      address_1: "Moda Cad. No:5",
      postal_code: "34710",
    }
    expect(
      await saveCheckoutContactAction({ email: "a@b.com", address: corp, useDifferentBillingAddress: true, billingAddress })
    ).toEqual({ ok: true })
    const body = h.sdk.store.cart.update.mock.calls[0][1]
    expect(body.shipping_address.city).toBe("Trabzon")
    expect(body.billing_address).toMatchObject({ city: "İstanbul", address_2: "Moda", postal_code: "34710" })
    expect(body.billing_address.metadata).toEqual({
      district: "Kadıköy",
      neighbourhood: "Moda",
      city_code: "34",
      invoice_type: "corporate",
      email: "a@b.com",
      vkn: "1234567890",
      tax_office: "Uzun",
      company_name: "Es Çay A.Ş.",
    })
  })

  it("geçersiz fatura adresi reddedilir", async () => {
    expect(
      await saveCheckoutContactAction({
        email: "a@b.com",
        address,
        useDifferentBillingAddress: true,
        billingAddress: { ...address, district: "Kadıköy" },
      })
    ).toEqual({ ok: false, message: "Trabzon için listeden bir ilçe seçin." })
  })

  it("SDK hatası mesajla döner", async () => {
    h.sdk.store.cart.update.mockRejectedValue(new Error("Cart is completed"))
    expect(await saveCheckoutContactAction({ email: "a@b.com", address })).toEqual({
      ok: false,
      message: "Cart is completed",
    })
  })
})

describe("kargo", () => {
  it("seçenek boşsa hata", async () => {
    expect(await applyShippingOptionAction("")).toEqual({ ok: false, message: "Kargo seçin." })
  })

  it("calculated seçenek ayrıca hesaplanır; hata → null tutar", async () => {
    h.sdk.store.fulfillment.listCartOptions.mockResolvedValue({
      shipping_options: [
        { id: "so_flat", name: "Standart", amount: 99.9 },
        { id: "so_calc", name: "DHL", amount: null, price_type: "calculated" },
        { id: "so_bad", name: "Hatalı", price_type: "calculated" },
      ],
    })
    h.sdk.store.fulfillment.calculate.mockImplementation(async (id: string) => {
      if (id === "so_bad") throw new Error("x")
      return { shipping_option: { amount: 74.5 } }
    })
    expect(await listShippingOptionsAction()).toEqual({
      ok: true,
      options: [
        { id: "so_flat", name: "Standart", amount: 99.9 },
        { id: "so_calc", name: "DHL", amount: 74.5 },
        { id: "so_bad", name: "Hatalı", amount: null },
      ],
    })
    expect(h.sdk.store.fulfillment.calculate).toHaveBeenCalledTimes(2)
  })
})

describe("indirim kodu", () => {
  it("boş kod", async () => {
    expect(await applyPromoCodeAction("   ")).toEqual({ ok: false, message: "İndirim kodu girin." })
    expect(await removePromoCodeAction("")).toEqual({ ok: false, message: "Kaldırılacak kod yok." })
  })

  it("kırpılmış kod gönderilir", async () => {
    h.sdk.store.cart.addPromotions.mockResolvedValue({})
    expect(await applyPromoCodeAction("  YAZ10 ")).toEqual({ ok: true })
    expect(h.sdk.store.cart.addPromotions.mock.calls[0][1]).toEqual({ promo_codes: ["YAZ10"] })
  })

  it.each(["Promotion not found", "The promotion code YAZ10 is invalid", "Kod süresi doldu"])(
    "'%s' → Türkçe genel mesaj",
    async (msg) => {
      h.sdk.store.cart.addPromotions.mockRejectedValue(new Error(msg))
      expect(await applyPromoCodeAction("YAZ10")).toEqual({
        ok: false,
        message: "İndirim kodu geçersiz veya bu sepete uygulanamıyor.",
      })
    }
  )

  it("tanınmayan hata olduğu gibi; mesajsız hata yedek", async () => {
    h.sdk.store.cart.addPromotions.mockRejectedValueOnce(new Error("Sunucu meşgul"))
    expect(await applyPromoCodeAction("YAZ10")).toEqual({ ok: false, message: "Sunucu meşgul" })
    h.sdk.store.cart.addPromotions.mockRejectedValueOnce({})
    expect(await applyPromoCodeAction("YAZ10")).toEqual({ ok: false, message: "İndirim kodu uygulanamadı." })
  })
})

describe("completeCheckoutAction", () => {
  it("kart (güvenli token): sipariş oluşturulmaz, kayıt + redirect", async () => {
    h.sdk.client.fetch.mockResolvedValue({})
    h.jar.store.set(PENDING, "[]")
    await expect(
      completeCheckoutAction({ iframeToken: "tok_abcdefgh123", legalAcceptedAt: "2026-11-06T10:00:00Z" })
    ).rejects.toThrow("NEXT_REDIRECT")
    expect(h.redirect).toHaveBeenCalledWith("/odeme/payment/tok_abcdefgh123")
    expect(h.sdk.store.cart.update.mock.calls[0][1].metadata).toEqual({
      utm_source: "ig",
      legal_accepted_at: "2026-11-06T10:00:00Z",
      payment_method: "card",
    })
    expect(h.sdk.client.fetch).toHaveBeenCalledWith(
      "/store/paytr-checkout/register",
      expect.objectContaining({
        method: "POST",
        body: { cart_id: "cart_1", iframe_token: "tok_abcdefgh123" },
      })
    )
    expect(h.sdk.store.cart.complete).not.toHaveBeenCalled()
    expect(h.jar.store.has(CART)).toBe(true)
    expect(h.jar.store.has(PENDING)).toBe(false)
  })

  it("kayıt başarısızsa redirect yok (iframe açılmaz)", async () => {
    h.sdk.client.fetch.mockRejectedValue(new Error("register failed"))
    expect(await completeCheckoutAction({ iframeToken: "tok_abcdefgh123" })).toEqual({
      ok: false,
      message: "register failed",
    })
    expect(h.redirect).not.toHaveBeenCalled()
  })

  it("havale: token olsa da cart.complete; çerezler + bekleyen kalemler yazılır", async () => {
    h.sdk.store.cart.complete.mockResolvedValue({ order: { id: "order_1", email: "ayse@gmail.com" } })
    const r = await completeCheckoutAction({ iframeToken: "tok_abcdefgh123", paymentMethod: "bank_transfer" })
    expect(r).toEqual({ ok: true, orderId: "order_1" })
    expect(h.redirect).not.toHaveBeenCalled()
    expect(h.sdk.store.cart.update.mock.calls[0][1].metadata.payment_method).toBe("bank_transfer")
    expect(h.jar.store.get("_escay_last_order_email")).toBe("ayse@gmail.com")
    expect(h.jar.store.get("_escay_last_order_id")).toBe("order_1")
    expect(JSON.parse(h.jar.store.get(PENDING)!)).toEqual([{ variant_id: "var_1", quantity: 2 }])
    expect(h.jar.store.has(CART)).toBe(false)
  })

  it("güvensiz token kart yolunu açmaz (yol enjeksiyonu yok)", async () => {
    h.sdk.store.cart.complete.mockResolvedValue({ order: { id: "order_2", email: null } })
    const r = await completeCheckoutAction({ iframeToken: "../../admin" })
    expect(r).toEqual({ ok: true, orderId: "order_2" })
    expect(h.redirect).not.toHaveBeenCalled()
    // e-posta siparişte yoksa sepetten
    expect(h.jar.store.get("_escay_last_order_email")).toBe("ayse@gmail.com")
  })

  it("sipariş dönmezse hata, sepet çerezi kalır", async () => {
    h.sdk.store.cart.complete.mockResolvedValue({ type: "cart", error: {} })
    expect(await completeCheckoutAction()).toEqual({ ok: false, message: "Sipariş oluşturulamadı." })
    expect(h.jar.store.has(CART)).toBe(true)
  })

  it("sepet çerezi yoksa hata", async () => {
    h.jar.store.delete(CART)
    expect(await completeCheckoutAction()).toEqual({ ok: false, message: "Sepet bulunamadı. Önce ürün ekleyin." })
  })
})

describe("pollPaytrCheckoutAction", () => {
  it("oid veya sepet yoksa unknown", async () => {
    expect(await pollPaytrCheckoutAction("")).toEqual({ state: "unknown" })
    h.jar.store.delete(CART)
    expect(await pollPaytrCheckoutAction("ES123")).toEqual({ state: "unknown" })
    expect(h.sdk.client.fetch).not.toHaveBeenCalled()
  })

  it("tamamlandı: çerezler yazılır, sepet bırakılır", async () => {
    h.sdk.client.fetch.mockResolvedValue({ state: "completed", order_id: "order_9", email: "a@b.com" })
    expect(await pollPaytrCheckoutAction("ES123")).toEqual({ state: "completed", orderId: "order_9" })
    expect(h.sdk.client.fetch).toHaveBeenCalledWith("/store/paytr-checkout/status", {
      method: "GET",
      query: { oid: "ES123", cart_id: "cart_1" },
    })
    expect(h.jar.store.get("_escay_last_order_id")).toBe("order_9")
    expect(h.jar.store.has(CART)).toBe(false)
  })

  it("order_id'siz completed unknown; ağ hatası processing", async () => {
    h.sdk.client.fetch.mockResolvedValueOnce({ state: "completed" })
    expect(await pollPaytrCheckoutAction("ES123")).toEqual({ state: "unknown" })
    h.sdk.client.fetch.mockResolvedValueOnce({ state: "processing" })
    expect(await pollPaytrCheckoutAction("ES123")).toEqual({ state: "processing" })
    h.sdk.client.fetch.mockRejectedValueOnce(new Error("ECONNRESET"))
    expect(await pollPaytrCheckoutAction("ES123")).toEqual({ state: "processing" })
    expect(h.jar.store.has(CART)).toBe(true)
  })
})
