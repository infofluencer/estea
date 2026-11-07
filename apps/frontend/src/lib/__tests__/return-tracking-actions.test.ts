import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  cookies: new Map<string, string>(),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (h.cookies.has(k) ? { name: k, value: h.cookies.get(k)! } : undefined),
  }),
}))
vi.mock("@/lib/medusa", () => ({ sdk: { client: { fetch: h.fetch } } }))

import { lookupOrderAction } from "../order-tracking-actions"
import {
  createReturnRequestAction,
  listExchangeOptionsAction,
  listReturnReasonsAction,
} from "../return-actions"

beforeEach(() => {
  h.fetch.mockReset()
  h.cookies.clear()
})

describe("lookupOrderAction", () => {
  it("boş alanlar", async () => {
    expect(await lookupOrderAction("  ", "a@b.com")).toEqual({
      ok: false,
      message: "Sipariş numarası ve e-posta gerekli.",
    })
    expect(await lookupOrderAction("#100003", " ")).toMatchObject({ ok: false })
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it("geçersiz numara backend'e gitmeden 'bulunamadı'", async () => {
    expect(await lookupOrderAction("abc", "a@b.com")).toEqual({
      ok: false,
      message: "Sipariş bulunamadı, bilgileri kontrol edin.",
    })
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it("kırpılmış girdi ile sorgular", async () => {
    h.fetch.mockResolvedValue({ order: { id: "order_1" } })
    expect(await lookupOrderAction(" #100003 ", " a@b.com ")).toEqual({ ok: true, order: { id: "order_1" } })
    expect(h.fetch).toHaveBeenCalledWith("/store/orders/lookup", {
      method: "POST",
      body: { id: "#100003", email: "a@b.com" },
    })
  })

  it("429 → bekleme mesajı; diğer hatalar 'bulunamadı'", async () => {
    h.fetch.mockRejectedValueOnce(new Error("Too many requests"))
    expect(await lookupOrderAction("100003", "a@b.com")).toEqual({
      ok: false,
      message: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.",
    })
    h.fetch.mockRejectedValueOnce(new Error("Not authorized"))
    expect(await lookupOrderAction("100003", "a@b.com")).toMatchObject({
      message: "Sipariş bulunamadı, bilgileri kontrol edin.",
    })
    h.fetch.mockResolvedValueOnce({})
    expect(await lookupOrderAction("100003", "a@b.com")).toMatchObject({ ok: false })
  })
})

describe("createReturnRequestAction", () => {
  const valid = {
    order_id: " order_1 ",
    reason_id: " rr_1 ",
    items: [
      { id: "li_1", quantity: 1 },
      { id: "li_2", quantity: 0 },
      { id: "", quantity: 2 },
      { id: "li_3", quantity: 2, exchange_variant_id: "var_9" },
    ],
  }

  it("ürün / sebep / sipariş eksikse backend'e gitmez", async () => {
    const msg = { ok: false, message: "Ürün, adet ve iade sebebi seçilmelidir." }
    expect(await createReturnRequestAction({ ...valid, order_id: " " })).toEqual(msg)
    expect(await createReturnRequestAction({ ...valid, reason_id: "" })).toEqual(msg)
    expect(await createReturnRequestAction({ ...valid, items: [{ id: "li_1", quantity: 0 }] })).toEqual(msg)
    expect(await createReturnRequestAction({ ...valid, items: [] })).toEqual(msg)
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it("misafir: e-posta ile /guest; geçersiz kalemler süzülür", async () => {
    h.fetch.mockResolvedValue({ return: { id: "ret_1" } })
    const r = await createReturnRequestAction({ ...valid, email: " a@b.com ", note: "  " })
    expect(r).toEqual({ ok: true, return: { id: "ret_1" } })
    expect(h.fetch).toHaveBeenCalledWith("/store/returns/guest", {
      method: "POST",
      body: {
        order_id: "order_1",
        email: "a@b.com",
        items: [
          { id: "li_1", quantity: 1 },
          { id: "li_3", quantity: 2, exchange_variant_id: "var_9" },
        ],
        reason_id: "rr_1",
        note: null,
      },
    })
  })

  it("üye: oturum yoksa hata, varsa Bearer ile /request", async () => {
    expect(await createReturnRequestAction(valid)).toEqual({
      ok: false,
      message: "İade için giriş yapmanız veya e-posta doğrulaması gerekir.",
    })
    h.cookies.set("_escay_jwt", "jwt_1")
    h.fetch.mockResolvedValue({ return: { id: "ret_2" } })
    expect(await createReturnRequestAction({ ...valid, note: " kırık geldi " })).toMatchObject({ ok: true })
    expect(h.fetch.mock.calls[0][0]).toBe("/store/returns/request")
    expect(h.fetch.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer jwt_1" },
      body: { note: "kırık geldi" },
    })
  })

  it("hata mesajı eşlemesi", async () => {
    const run = async (err: unknown) => {
      h.fetch.mockRejectedValueOnce(err)
      return createReturnRequestAction({ ...valid, email: "a@b.com" })
    }
    expect(await run(new Error("429 rate_limit"))).toMatchObject({
      message: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.",
    })
    expect(await run(new Error("Order not found"))).toMatchObject({
      message: "Sipariş bulunamadı, bilgileri kontrol edin.",
    })
    expect(await run(new Error("İade süresi doldu"))).toMatchObject({ message: "İade süresi doldu" })
    expect(await run("x")).toMatchObject({ message: "İade talebi oluşturulamadı. Lütfen tekrar deneyin." })
  })

  it("yanıtta iade id yoksa hata", async () => {
    h.fetch.mockResolvedValue({})
    expect(await createReturnRequestAction({ ...valid, email: "a@b.com" })).toEqual({
      ok: false,
      message: "İade talebi oluşturulamadı.",
    })
  })
})

describe("liste uçları hata yutar", () => {
  it("iade sebepleri", async () => {
    h.fetch.mockResolvedValueOnce({ return_reasons: [{ id: "rr_1" }] })
    expect(await listReturnReasonsAction()).toEqual([{ id: "rr_1" }])
    h.fetch.mockRejectedValueOnce(new Error("x"))
    expect(await listReturnReasonsAction()).toEqual([])
  })

  it("değişim seçenekleri: misafirde auth header yok", async () => {
    h.cookies.set("_escay_jwt", "jwt_1")
    h.fetch.mockResolvedValue({ items: [{ item_id: "li_1" }] })
    expect(await listExchangeOptionsAction({ order_id: "order_1", email: "a@b.com" })).toEqual([{ item_id: "li_1" }])
    expect(h.fetch.mock.calls[0][1]).toMatchObject({ headers: undefined, body: { order_id: "order_1", email: "a@b.com" } })
    await listExchangeOptionsAction({ order_id: "order_1" })
    expect(h.fetch.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: "Bearer jwt_1" },
      body: { email: null },
    })
    h.fetch.mockRejectedValueOnce(new Error("x"))
    expect(await listExchangeOptionsAction({ order_id: "order_1" })).toEqual([])
  })
})
