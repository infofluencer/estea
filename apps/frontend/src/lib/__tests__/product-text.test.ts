import { describe, expect, it } from "vitest"
import { cleanProductText } from "@/lib/product-text"

describe("cleanProductText", () => {
  it("WooCommerce video kısa kodunu siler, paragrafları korur", () => {
    const raw =
      'Birinci paragraf.\n\n[video width="528" height="480" mp4="https://market.esteacay.com/a.mp4"][/video]\n\nİkinci paragraf.'
    expect(cleanProductText(raw)).toBe("Birinci paragraf.\n\nİkinci paragraf.")
  })

  it("tek başına kısa kod ve HTML etiketlerini siler", () => {
    expect(cleanProductText("<p>Çay</p> [gallery ids=\"1,2\"]")).toBe("Çay")
  })

  it("boş girdi", () => {
    expect(cleanProductText(null)).toBe("")
    expect(cleanProductText("[video mp4=\"x\"][/video]")).toBe("")
  })
})
