import { describe, expect, it } from "vitest"
import { PRODUCT_IMAGE } from "../medusa"
import { displayColor, resolveCardImages } from "../product-images"

describe("displayColor", () => {
  it.each(["Tek Renk", "Standart", "Default", "Default Variant", "", null, undefined])(
    "gizli: %j → null",
    (v) => {
      expect(displayColor(v)).toBeNull()
    }
  )

  it("gerçek varyant adı döner (büyük/küçük harf duyarlı)", () => {
    expect(displayColor("500 g")).toBe("500 g")
    expect(displayColor("standart")).toBe("standart")
  })
})

describe("resolveCardImages", () => {
  it("thumbnail önce, hover ilk farklı görsel", () => {
    expect(resolveCardImages({ thumbnail: "a.jpg", medusaImages: ["a.jpg", "b.jpg", "c.jpg"] })).toEqual({
      image: "a.jpg",
      hoverImage: "b.jpg",
    })
  })

  it("thumbnail yoksa ilk görsel", () => {
    expect(resolveCardImages({ medusaImages: ["", "b.jpg", "c.jpg"] })).toEqual({
      image: "b.jpg",
      hoverImage: "c.jpg",
    })
  })

  it("tek görsel → hover yok", () => {
    expect(resolveCardImages({ thumbnail: "a.jpg", medusaImages: ["a.jpg"] })).toEqual({
      image: "a.jpg",
      hoverImage: null,
    })
  })

  it("hiç görsel yoksa varsayılan ürün görseli", () => {
    const r = resolveCardImages({ thumbnail: null, medusaImages: null })
    expect(r).toEqual({ image: PRODUCT_IMAGE, hoverImage: null })
    expect(PRODUCT_IMAGE).toMatch(/\/files\/site\/products\/default\.png$/)
  })
})
