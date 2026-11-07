import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  FAVORITE_ADDED_EVENT,
  readFavorites,
  toggleFavorite,
  toggleFavoriteLocal,
  toWishlistInput,
  writeFavorites,
  type FavoriteProduct,
} from "../favorites"

let store: Map<string, string>
let events: Event[]

beforeEach(() => {
  store = new Map()
  events = []
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  vi.stubGlobal("window", { dispatchEvent: (e: Event) => events.push(e) })
})

const tea: FavoriteProduct = { id: "prod_1", handle: "rize-turist", title: "Rize Turist", price: 249.9, image: "a.jpg" }

describe("readFavorites", () => {
  it("SSR'da (window yok) boş liste", () => {
    vi.unstubAllGlobals()
    expect(readFavorites()).toEqual([])
  })

  it("kayıt yok / bozuk JSON / dizi değil → []", () => {
    expect(readFavorites()).toEqual([])
    store.set("escay_favorites", "{bozuk")
    expect(readFavorites()).toEqual([])
    store.set("escay_favorites", '{"id":1}')
    expect(readFavorites()).toEqual([])
  })

  it("localStorage erişimi hata atarsa []", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError")
      },
    })
    expect(readFavorites()).toEqual([])
  })
})

describe("writeFavorites / toggleFavoriteLocal", () => {
  it("yazar ve escay:favorites olayı yayar", () => {
    writeFavorites([tea])
    expect(JSON.parse(store.get("escay_favorites")!)).toEqual([tea])
    expect(events.map((e) => e.type)).toEqual(["escay:favorites"])
  })

  it("ekleme true döner ve favorite-added detayını yayar", () => {
    expect(toggleFavoriteLocal(tea)).toBe(true)
    expect(readFavorites()).toEqual([tea])
    expect(events.map((e) => e.type)).toEqual(["escay:favorites", FAVORITE_ADDED_EVENT])
    expect((events[1] as CustomEvent).detail).toEqual({ title: "Rize Turist", image: "a.jpg", price: 249.9 })
  })

  it("ikinci kez çıkarır, false döner, added olayı yok", () => {
    toggleFavoriteLocal(tea)
    events = []
    expect(toggleFavorite({ ...tea, title: "farklı başlık" })).toBe(false)
    expect(readFavorites()).toEqual([])
    expect(events.map((e) => e.type)).toEqual(["escay:favorites"])
  })

  it("diğer favorileri korur", () => {
    const other = { id: "prod_2", handle: "yesil", title: "Yeşil Çay" }
    toggleFavoriteLocal(tea)
    toggleFavoriteLocal(other)
    toggleFavoriteLocal(tea)
    expect(readFavorites()).toEqual([other])
  })
})

describe("toWishlistInput", () => {
  it("eksik görsel / fiyat null olur", () => {
    expect(toWishlistInput({ id: "p", handle: "h", title: "t" })).toEqual({
      product_id: "p",
      handle: "h",
      title: "t",
      thumbnail: null,
      price: null,
    })
    expect(toWishlistInput(tea)).toMatchObject({ thumbnail: "a.jpg", price: 249.9 })
  })
})
