import { beforeEach, describe, expect, it, vi } from "vitest"

const jar = vi.hoisted(() => {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn((k: string) => (store.has(k) ? { name: k, value: store.get(k)! } : undefined)),
    set: vi.fn((k: string, v: string) => void store.set(k, v)),
    delete: vi.fn((k: string) => void store.delete(k)),
  }
})
vi.mock("next/headers", () => ({ cookies: async () => jar }))

import {
  PENDING_CHECKOUT_COOKIE,
  PENDING_CHECKOUT_COOKIE_OPTIONS,
  clearPendingCheckoutItems,
  getPendingCheckoutItems,
  setPendingCheckoutItems,
} from "../pending-checkout"

beforeEach(() => {
  jar.store.clear()
  jar.set.mockClear()
})

describe("setPendingCheckoutItems", () => {
  it("geçersiz satırları atar, adedi tam sayıya çevirip 99'la sınırlar", async () => {
    await setPendingCheckoutItems([
      { variant_id: "var_1", quantity: 2.7 },
      { variant_id: "var_2", quantity: 150 },
      { variant_id: "", quantity: 1 },
      { variant_id: "var_3", quantity: 0 },
      { variant_id: "var_4", quantity: -1 },
    ])
    expect(jar.set).toHaveBeenCalledWith(
      PENDING_CHECKOUT_COOKIE,
      JSON.stringify([
        { variant_id: "var_1", quantity: 2 },
        { variant_id: "var_2", quantity: 99 },
      ]),
      PENDING_CHECKOUT_COOKIE_OPTIONS
    )
  })

  it("temiz satır yoksa çerez yazılmaz", async () => {
    await setPendingCheckoutItems([{ variant_id: "v", quantity: 0 }])
    await setPendingCheckoutItems([])
    expect(jar.set).not.toHaveBeenCalled()
  })

  it("0 < adet < 1 süzgeçten geçip 0 adet olarak yazılır (mevcut davranış)", async () => {
    // filter `quantity > 0` floor'dan önce çalışıyor; okurken qty<1 elendiği için zararsız.
    await setPendingCheckoutItems([{ variant_id: "v", quantity: 0.5 }])
    expect(JSON.parse(jar.store.get(PENDING_CHECKOUT_COOKIE)!)).toEqual([{ variant_id: "v", quantity: 0 }])
    expect(await getPendingCheckoutItems()).toBeNull()
  })
})

describe("getPendingCheckoutItems", () => {
  it("çerez yoksa null", async () => {
    expect(await getPendingCheckoutItems()).toBeNull()
  })

  it("gidiş-dönüş", async () => {
    await setPendingCheckoutItems([{ variant_id: "var_1", quantity: 3 }])
    expect(await getPendingCheckoutItems()).toEqual([{ variant_id: "var_1", quantity: 3 }])
  })

  it("elle bozulmuş çerezi temizler", async () => {
    jar.store.set(
      PENDING_CHECKOUT_COOKIE,
      JSON.stringify([
        null,
        "x",
        { variant_id: "  var_1  ", quantity: "4" },
        { variant_id: 5, quantity: 1 },
        { variant_id: "   ", quantity: 1 },
        { variant_id: "var_2", quantity: "abc" },
        { variant_id: "var_3", quantity: 0 },
        { variant_id: "var_4", quantity: 1000.9 },
      ])
    )
    expect(await getPendingCheckoutItems()).toEqual([
      { variant_id: "var_1", quantity: 4 },
      { variant_id: "var_4", quantity: 99 },
    ])
  })

  it.each(["{bozuk", '{"variant_id":"v"}', "[]", '[{"variant_id":"v","quantity":0}]'])(
    "geçersiz içerik %j → null",
    async (raw) => {
      jar.store.set(PENDING_CHECKOUT_COOKIE, raw)
      expect(await getPendingCheckoutItems()).toBeNull()
    }
  )

  it("clear çerezi siler", async () => {
    jar.store.set(PENDING_CHECKOUT_COOKIE, "[]")
    await clearPendingCheckoutItems()
    expect(jar.delete).toHaveBeenCalledWith(PENDING_CHECKOUT_COOKIE)
    expect(jar.store.has(PENDING_CHECKOUT_COOKIE)).toBe(false)
  })
})
