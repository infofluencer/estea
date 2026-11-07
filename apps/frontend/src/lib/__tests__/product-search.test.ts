import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const list = vi.hoisted(() => vi.fn())
vi.mock("@/lib/medusa", () => ({
  sdk: { store: { product: { list } } },
  storePricingParams: () => ({ region_id: "reg_tr", country_code: "tr" }),
}))

type P = {
  title: string
  description?: string
  collection?: { title: string }
  variants?: { sku?: string; title?: string; options?: { value: string }[] }[]
}

const catalog: P[] = [
  { title: "Rize Turist Çay", variants: [{ sku: "RT500", title: "500 g" }] },
  { title: "Yeşil Çay", collection: { title: "Doğal Seri" }, variants: [{ options: [{ value: "Limonlu" }] }] },
  { title: "Siyah Çay", description: "Koleksiyonumuzun en sevileni, ilk hasat" },
  { title: "İyon Harman", variants: [{ title: "250 g" }] },
  { title: "Bergamot Kokulu Çay" },
]

async function load() {
  vi.resetModules()
  return import("../product-search")
}

const titles = (ps: { title?: string | null }[]) => ps.map((p) => p.title)

beforeEach(() => {
  list.mockReset()
  list.mockResolvedValue({ products: catalog })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("normalizeSearchText", () => {
  it("Türkçe büyük/küçük harf ve aksan katlama", async () => {
    const { normalizeSearchText } = await load()
    expect(normalizeSearchText("İyon")).toBe("iyon")
    expect(normalizeSearchText("IYON")).toBe("iyon") // I → ı → i
    expect(normalizeSearchText("ıyon")).toBe("iyon")
    expect(normalizeSearchText("ÇAYKUR Şeker Göğüs Üzüm")).toBe("caykur seker gogus uzum")
    expect(normalizeSearchText("Café")).toBe("cafe")
  })
})

describe("searchCatalog", () => {
  it("boş / yalnız noktalama sorgu kataloğu çekmez", async () => {
    const { searchCatalog } = await load()
    expect(await searchCatalog("", 10)).toEqual([])
    expect(await searchCatalog("  -- ", 10)).toEqual([])
    expect(list).not.toHaveBeenCalled()
  })

  it("katalog fiyat bağlamı + limit 300 ile çekilir", async () => {
    const { searchCatalog } = await load()
    await searchCatalog("çay", 10)
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 300, region_id: "reg_tr", country_code: "tr" })
    )
  })

  it("Türkçe karakter duyarsız: 'yesil' → Yeşil Çay, 'IYON' → İyon Harman", async () => {
    const { searchCatalog } = await load()
    expect(titles(await searchCatalog("yesil", 10))).toEqual(["Yeşil Çay"])
    expect(titles(await searchCatalog("IYON", 10))).toEqual(["İyon Harman"])
  })

  it("açıklamada kelime ortası eşleşmez ('iyon' ⊄ 'koleksiyonumuzun')", async () => {
    const { searchCatalog } = await load()
    expect(titles(await searchCatalog("iyon", 10))).not.toContain("Siyah Çay")
    expect(titles(await searchCatalog("hasat", 10))).toEqual(["Siyah Çay"])
  })

  it("her kelime eşleşmeli", async () => {
    const { searchCatalog } = await load()
    expect(await searchCatalog("rize yeşil", 10)).toEqual([])
    expect(titles(await searchCatalog("rize çay", 10))).toEqual(["Rize Turist Çay"])
  })

  it("SKU, seçenek ve koleksiyon ile bulur", async () => {
    const { searchCatalog } = await load()
    expect(titles(await searchCatalog("rt500", 10))).toEqual(["Rize Turist Çay"])
    expect(titles(await searchCatalog("limon", 10))).toEqual(["Yeşil Çay"])
    expect(titles(await searchCatalog("dogal", 10))).toEqual(["Yeşil Çay"])
  })

  it("yazım hatası toleransı: 'bergmot' → Bergamot", async () => {
    const { searchCatalog } = await load()
    expect(titles(await searchCatalog("bergmot", 10))).toEqual(["Bergamot Kokulu Çay"])
    // 3 harften kısa kelimede bulanık eşleşme yok
    expect(await searchCatalog("xa", 10)).toEqual([])
  })

  it("aynı puanda Türkçe alfabetik sıra, limit uygulanır", async () => {
    const { searchCatalog } = await load()
    expect(titles(await searchCatalog("çay", 10))).toEqual([
      "Bergamot Kokulu Çay",
      "Rize Turist Çay",
      "Siyah Çay",
      "Yeşil Çay",
    ])
    expect(titles(await searchCatalog("çay", 2))).toEqual(["Bergamot Kokulu Çay", "Rize Turist Çay"])
  })

  it("ad başı eşleşmesi ad içi eşleşmesinden önce gelir", async () => {
    list.mockResolvedValue({ products: [{ title: "Karadeniz Harmanı" }, { title: "Deniz Çayı" }] })
    const { searchCatalog } = await load()
    expect(titles(await searchCatalog("deniz", 10))).toEqual(["Deniz Çayı", "Karadeniz Harmanı"])
  })

  it("katalog 60 sn önbellekte; hata önbelleği temizler", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"))
    const { searchCatalog } = await load()
    await searchCatalog("çay", 5)
    await searchCatalog("rize", 5)
    expect(list).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date("2026-11-06T10:01:01Z"))
    list.mockRejectedValueOnce(new Error("backend down"))
    await expect(searchCatalog("çay", 5)).rejects.toThrow("backend down")
    expect(titles(await searchCatalog("rize", 5))).toEqual(["Rize Turist Çay"])
    expect(list).toHaveBeenCalledTimes(3)
  })
})
