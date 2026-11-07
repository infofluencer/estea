import { describe, expect, it } from "vitest"
import {
  formatSpecKey,
  formatSpecValue,
  getSpecEntries,
  getSpecIconName,
  getSpecLabel,
  normalizeSpecifications,
  resolveSpecEntries,
} from "../spec-labels"

const keys = (rows: { key: string }[]) => rows.map((r) => r.key)

describe("etiket / ikon", () => {
  it("bilinen anahtarlar Türkçe başlık", () => {
    expect(getSpecLabel("brew_temp")).toBe("Demleme Sıcaklığı")
    expect(getSpecIconName("brew_temp")).toBe("flame")
    expect(getSpecLabel("origin")).toBe("Menşei")
  })

  it("bilinmeyen anahtar biçimlenir, ikon file", () => {
    expect(getSpecLabel("leaf_grade")).toBe("Leaf Grade")
    expect(formatSpecKey("brewTime")).toBe("Brew Time")
    expect(formatSpecKey("  a__b ")).toBe("A B")
    expect(getSpecIconName("leaf_grade")).toBe("file")
  })

  // HATA: \b\w ASCII'ye göre çalışır; Türkçe harfler kelime sınırı sayılır
  // ("çay_türü" → "çAy TüRü"). Admin'de Türkçe anahtar girilirse başlık bozulur.
  it.fails("Türkçe anahtar düzgün büyük harflenir", () => {
    expect(formatSpecKey("çay_türü")).toBe("Çay Türü")
  })
})

describe("formatSpecValue", () => {
  it("değer biçimleri", () => {
    expect(formatSpecValue(null)).toBeNull()
    expect(formatSpecValue("  ")).toBeNull()
    expect(formatSpecValue(" Rize ")).toBe("Rize")
    expect(formatSpecValue(500)).toBe("500")
    expect(formatSpecValue(false)).toBe("false")
    expect(formatSpecValue(["bergamot", " ", null, "limon"])).toBe("bergamot, limon")
    expect(formatSpecValue([])).toBeNull()
    expect(formatSpecValue({ a: 1 })).toBe('{"a":1}')
  })
})

describe("normalizeSpecifications", () => {
  it("nesne veya JSON string kabul eder", () => {
    expect(normalizeSpecifications({ origin: "Rize" })).toEqual({ origin: "Rize" })
    expect(normalizeSpecifications(' {"origin":"Rize"} ')).toEqual({ origin: "Rize" })
  })

  it.each([null, "", "  ", "{bozuk", "[1,2]", '"metin"', [1], 42])("geçersiz: %j → null", (v) => {
    expect(normalizeSpecifications(v)).toBeNull()
  })
})

describe("getSpecEntries", () => {
  it("bilinen anahtarlar sabit sırada, bilinmeyenler sonda", () => {
    const rows = getSpecEntries({
      leaf_grade: "OP",
      brew_temp: "90 °C",
      origin: "Rize",
      weight: "500 g",
      empty: "  ",
    })
    expect(keys(rows)).toEqual(["origin", "weight", "brew_temp", "leaf_grade"])
    expect(rows[0]).toEqual({ key: "origin", label: "Menşei", icon: "file", value: "Rize" })
  })

  it("feature_* satırları tek madde listesine birleşir; saklama notu care olur", () => {
    const rows = getSpecEntries({
      origin: "Rize",
      feature_1: "Katkısız",
      feature_2: "Serin ve kuru yerde saklayın",
      feature_3: "İlk hasat",
    })
    expect(keys(rows)).toEqual(["origin", "features", "care"])
    const features = rows.find((r) => r.key === "features")
    expect(features?.bullets).toEqual(["Katkısız", "İlk hasat"])
    expect(features?.value).toBe("Katkısız\nİlk hasat")
    expect(rows.find((r) => r.key === "care")?.value).toBe("Serin ve kuru yerde saklayın")
  })

  it("saklama olmayan care, özellik listesinin başına alınır", () => {
    const rows = getSpecEntries({ feature_1: "Katkısız", care: "El toplaması" })
    expect(keys(rows)).toEqual(["features"])
    expect(rows[0].bullets).toEqual(["El toplaması", "Katkısız"])
  })

  // HATA: feature_* anahtarları sözlük sırasıyla dizildiği için feature_10,
  // feature_2'den önce gelir. 10+ maddelik üründe sıra bozulur.
  it.fails("feature_2 feature_10'dan önce gelir", () => {
    const input: Record<string, string> = {}
    for (let i = 1; i <= 10; i++) input[`feature_${i}`] = `Madde ${i}`
    const rows = getSpecEntries(input)
    expect(rows[0].bullets).toEqual(Array.from({ length: 10 }, (_, i) => `Madde ${i + 1}`))
  })

  it("boş / geçersiz → []", () => {
    expect(getSpecEntries(null)).toEqual([])
    expect(getSpecEntries("{bozuk")).toEqual([])
  })
})

describe("resolveSpecEntries", () => {
  it("specifications > düz metadata > kategori varsayılanı", () => {
    const rows = resolveSpecEntries(
      { specifications: { origin: "Rize" }, origin: "Artvin", weight: "1 kg" },
      ["siyah-cay"]
    )
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    expect(byKey.origin).toBe("Rize")
    expect(byKey.weight).toBe("1 kg")
    expect(byKey.brew_time).toBe("15–20 dakika")
    expect(keys(rows)).toEqual(["origin", "weight", "brew_dose", "brew_time", "brew_temp", "storage"])
  })

  it("kategori önceliği: yeşil çay siyah çaydan önce", () => {
    const rows = resolveSpecEntries({}, ["siyah-cay", "yesil-cay"])
    expect(rows.find((r) => r.key === "brew_temp")?.value).toMatch(/^75–80 °C/)
  })

  it("bilinmeyen kategori ve metadata yoksa boş", () => {
    expect(resolveSpecEntries(null, ["hediye"])).toEqual([])
    expect(resolveSpecEntries(undefined)).toEqual([])
  })

  it("boş düz değer varsayılanı ezmez", () => {
    const rows = resolveSpecEntries({ brew_time: "  " }, ["bitki-cayi"])
    expect(rows.find((r) => r.key === "brew_time")?.value).toBe("5–7 dakika")
  })
})
