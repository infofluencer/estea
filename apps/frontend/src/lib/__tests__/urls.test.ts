import { describe, expect, it } from "vitest"
import {
  CATEGORY_BASE,
  categoryPath,
  collectionPath,
  listingFromSegments,
  listingPath,
  productHandleFromSlug,
  productPath,
  productSlug,
} from "../urls"

describe("ürün yolu", () => {
  it("/urun/{handle}", () => {
    expect(productPath("rize-turist")).toBe("/urun/rize-turist")
    expect(productSlug("a")).toBe("a")
    expect(productHandleFromSlug("a")).toBe("a")
  })

  it("handle URL-encode edilir", () => {
    expect(productPath("çay kutusu")).toBe("/urun/%C3%A7ay%20kutusu")
    expect(productPath("a/b")).toBe("/urun/a%2Fb")
  })

  it("sorgu dizesi string veya URLSearchParams", () => {
    expect(productPath("x", "v=1")).toBe("/urun/x?v=1")
    expect(productPath("x", new URLSearchParams({ v: "var_1", utm_source: "google" }))).toBe(
      "/urun/x?v=var_1&utm_source=google"
    )
    expect(productPath("x", "")).toBe("/urun/x")
    expect(productPath("x", new URLSearchParams())).toBe("/urun/x")
  })
})

describe("kategori / koleksiyon", () => {
  it("yollar", () => {
    expect(CATEGORY_BASE).toBe("/urun-kategori")
    expect(categoryPath()).toBe("/urun-kategori")
    expect(categoryPath(null)).toBe("/urun-kategori")
    expect(categoryPath("siyah-cay")).toBe("/urun-kategori/siyah-cay")
    expect(collectionPath("yaz")).toBe("/urun-kategori/koleksiyon/yaz")
  })

  it("segmentler → filtre", () => {
    expect(listingFromSegments()).toEqual({})
    expect(listingFromSegments(["siyah-cay"])).toEqual({ category: "siyah-cay" })
    expect(listingFromSegments(["cay", "siyah-cay"])).toEqual({ category: "siyah-cay" })
    expect(listingFromSegments(["koleksiyon", "yaz"])).toEqual({ collection: "yaz" })
    expect(listingFromSegments(["koleksiyon"])).toEqual({ category: "koleksiyon" })
  })

  it("listingPath koleksiyonu kategoriye tercih eder", () => {
    expect(listingPath({ collection: "yaz", category: "siyah-cay" })).toBe("/urun-kategori/koleksiyon/yaz")
    expect(listingPath({ category: "siyah-cay" }, new URLSearchParams({ sort: "price_asc" }))).toBe(
      "/urun-kategori/siyah-cay?sort=price_asc"
    )
    expect(listingPath({})).toBe("/urun-kategori")
  })
})
