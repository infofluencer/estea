import { describe, expect, it } from "vitest"
import {
  TR_CITIES,
  isOfficialTrCityName,
  isValidTrPostalCode,
  listTrCities,
  normalizeTrPhone,
  normalizeTrPostalCode,
  trCityCodeForName,
} from "@escay/shared/tr-address"
import { TR_DISTRICTS, isTrDistrictOf } from "@escay/shared/tr-districts"

describe("TR il listesi", () => {
  it("81 il, 01–81 plaka kodları", () => {
    const codes = Object.keys(TR_CITIES).sort()
    const expected = Array.from({ length: 81 }, (_, i) => String(i + 1).padStart(2, "0"))
    expect(codes).toEqual(expected)
  })

  it("her ilin ilçe listesi var", () => {
    for (const code of Object.keys(TR_CITIES)) {
      expect(TR_DISTRICTS[code]?.length, code).toBeGreaterThan(0)
    }
  })

  it("listTrCities Türkçe alfabeye göre sıralı (Ç C'den sonra, İ I'dan sonra)", () => {
    const names = listTrCities().map((c) => c.name)
    expect(names).toHaveLength(81)
    expect(names[0]).toBe("Adana")
    expect(names.indexOf("Çanakkale")).toBeGreaterThan(names.indexOf("Bursa"))
    expect(names.indexOf("Çorum")).toBeLessThan(names.indexOf("Denizli"))
    expect(names.indexOf("Iğdır")).toBeLessThan(names.indexOf("İstanbul"))
    expect(names.indexOf("Isparta")).toBeLessThan(names.indexOf("İzmir"))
    expect(names.at(-1)).toBe("Zonguldak")
  })

  it("resmi ad kontrolü ve plaka kodu", () => {
    expect(isOfficialTrCityName(" İstanbul ")).toBe(true)
    expect(isOfficialTrCityName("istanbul")).toBe(false)
    expect(isOfficialTrCityName("")).toBe(false)
    expect(trCityCodeForName("Şanlıurfa")).toBe("63")
    expect(trCityCodeForName(" Düzce ")).toBe("81")
    expect(trCityCodeForName("Urfa")).toBeNull()
  })

  it("isTrDistrictOf birebir eşleşme ister", () => {
    expect(isTrDistrictOf("61", " Of ")).toBe(true)
    expect(isTrDistrictOf("61", "of")).toBe(false)
    expect(isTrDistrictOf("34", "Of")).toBe(false)
    expect(isTrDistrictOf(null, "Of")).toBe(false)
    expect(isTrDistrictOf("61", "")).toBe(false)
  })
})

describe("normalizeTrPhone", () => {
  it.each([
    ["0555 111 22 33", "+905551112233"],
    ["+90 555 111 22 33", "+905551112233"],
    ["90 555 111 22 33", "+905551112233"],
    ["5551112233", "+905551112233"],
    ["(0462) 692 30 61", "+904626923061"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeTrPhone(input)).toBe(expected)
  })

  it.each([null, undefined, "", "555 111 22", "+90 0555 111 22 33", "+44 20 7946 0958 12"])(
    "geçersiz: %s → null",
    (input) => {
      expect(normalizeTrPhone(input)).toBeNull()
    }
  )
})

describe("posta kodu", () => {
  it("5 hane + geçerli il ön eki", () => {
    expect(isValidTrPostalCode("61030")).toBe(true)
    expect(isValidTrPostalCode("34 710")).toBe(true)
    expect(isValidTrPostalCode("81000")).toBe(true)
    expect(isValidTrPostalCode("82000")).toBe(false)
    expect(isValidTrPostalCode("00000")).toBe(false)
    expect(isValidTrPostalCode("6103")).toBe(false)
    expect(isValidTrPostalCode(null)).toBe(false)
  })

  it("normalize yalnız rakam bırakır", () => {
    expect(normalizeTrPostalCode(" 61-030 ")).toBe("61030")
  })
})
