import { describe, expect, it } from "vitest"
import {
  ADDRESS_LINE_HINT,
  buildBillingInvoiceMetadata,
  digitsOnly,
  isAddressLineOnlyLocation,
  isAddressLineSuspicious,
  isValidTckn,
  isValidVkn,
  listTrDistricts,
  validateCheckoutAddress,
  type CheckoutAddressInput,
} from "../checkout-address"

const base: CheckoutAddressInput = {
  first_name: " Ayşe ",
  last_name: " Yılmaz ",
  address_1: " Uzun Sk. No:12 D:3 ",
  city: "Trabzon",
  district: "Ortahisar",
  neighbourhood: "Kemerkaya",
  postal_code: "61 030",
  phone: "0555 111 22 33",
}

function fail(input: Partial<CheckoutAddressInput>) {
  const r = validateCheckoutAddress({ ...base, ...input })
  if (r.ok) throw new Error("beklenen hata gelmedi")
  return r
}

describe("digitsOnly / VKN / TCKN", () => {
  it("yalnız rakamları bırakır", () => {
    expect(digitsOnly("123 456-78.90")).toBe("1234567890")
    expect(digitsOnly(null)).toBe("")
    expect(digitsOnly(undefined)).toBe("")
  })

  it("VKN 10, TCKN 11 hane", () => {
    expect(isValidVkn("123 456 7890")).toBe(true)
    expect(isValidVkn("123456789")).toBe(false)
    expect(isValidVkn("10000000146")).toBe(false)
    expect(isValidTckn("1000000014 6")).toBe(true)
    expect(isValidTckn("1234567890")).toBe(false)
    expect(isValidTckn(null)).toBe(false)
  })

  it("VKN kontrol basamağı: tek rakam hatası yakalanır", () => {
    expect(isValidVkn("1234567891")).toBe(false)
    expect(isValidVkn("1234567980")).toBe(false)
    expect(isValidVkn("0000000000")).toBe(false)
  })

  it("TCKN kontrol basamağı: tek rakam hatası ve 0 ile başlayan reddedilir", () => {
    expect(isValidTckn("10000000147")).toBe(false)
    expect(isValidTckn("10000000156")).toBe(false)
    expect(isValidTckn("12345678901")).toBe(false)
    expect(isValidTckn("01000000146")).toBe(false)
  })
})

describe("isAddressLineOnlyLocation", () => {
  const ctx = { neighbourhood: "Kemerkaya", district: "Ortahisar", city: "Trabzon" }

  it("yalnız mahalle/ilçe/il adı yazılmışsa true", () => {
    expect(isAddressLineOnlyLocation("Kemerkaya Mahallesi", ctx)).toBe(true)
    expect(isAddressLineOnlyLocation("kemerkaya mah. ORTAHİSAR / Trabzon, Türkiye", ctx)).toBe(true)
    expect(isAddressLineOnlyLocation("   ", ctx)).toBe(true)
  })

  it("sokak veya numara varsa false", () => {
    expect(isAddressLineOnlyLocation("Kemerkaya Mah. Uzun Sk. No:12", ctx)).toBe(false)
    expect(isAddressLineOnlyLocation("12", ctx)).toBe(false)
  })

  it("Türkçe karakter katlaması: Çarşıbaşı ↔ CARSIBASI", () => {
    expect(isAddressLineOnlyLocation("CARSIBASI", { district: "Çarşıbaşı" })).toBe(true)
    expect(isAddressLineOnlyLocation("ÇARŞIBAŞI", { district: "Carsibasi" })).toBe(true)
  })
})

describe("isAddressLineSuspicious", () => {
  it("cadde adı + numara → şüpheli değil", () => {
    expect(isAddressLineSuspicious("Atatürk Cad. No:12 D:3")).toBe(false)
    expect(isAddressLineSuspicious("İSTİKLAL CADDESİ NO 5")).toBe(false)
  })

  it("numaralı sokak (1453 Sk. No:5) → şüpheli değil", () => {
    expect(isAddressLineSuspicious("1453 Sk. No:5")).toBe(false)
  })

  it("numara yoksa şüpheli", () => {
    expect(isAddressLineSuspicious("Atatürk Caddesi")).toBe(true)
  })

  it("yalnız numara (sokak/yer adı yok) şüpheli", () => {
    expect(isAddressLineSuspicious("No:5 D:3")).toBe(true)
    expect(isAddressLineSuspicious("1453 Sk.")).toBe(true) // tek sayı
  })

  it("bağlamdaki mahalle adı yer adı sayılmaz", () => {
    expect(isAddressLineSuspicious("Kemerkaya No:5", { neighbourhood: "Kemerkaya" })).toBe(true)
  })
})

describe("validateCheckoutAddress", () => {
  it("geçerli bireysel adres normalize edilir", () => {
    const r = validateCheckoutAddress(base)
    expect(r).toEqual({
      ok: true,
      normalized: {
        first_name: "Ayşe",
        last_name: "Yılmaz",
        address_1: "Uzun Sk. No:12 D:3",
        city: "Trabzon",
        district: "Ortahisar",
        neighbourhood: "Kemerkaya",
        postal_code: "61030",
        phone: "+905551112233",
        country_code: "tr",
        city_code: "61",
        invoice_type: "individual",
        vkn: undefined,
        tckn: undefined,
        tax_office: undefined,
        company_name: undefined,
      },
    })
  })

  it("alan sırası: ad → soyad → adres → il", () => {
    expect(fail({ first_name: "  " })).toMatchObject({ field: "first_name", message: "Ad zorunlu." })
    expect(fail({ last_name: "" })).toMatchObject({ field: "last_name", message: "Soyad zorunlu." })
    expect(fail({ address_1: " " })).toMatchObject({ field: "address_1", message: "Adres zorunlu." })
    expect(fail({ city: " " })).toMatchObject({ field: "city", message: "İl seçin." })
  })

  it("il resmi adla birebir olmalı (küçük harf / Türkçesiz reddedilir)", () => {
    expect(fail({ city: "trabzon" })).toMatchObject({ field: "city", message: "Geçerli bir il seçin." })
    expect(fail({ city: "Istanbul" }).field).toBe("city")
    const ist = validateCheckoutAddress({
      ...base,
      city: " İstanbul ",
      district: "Kadıköy",
      postal_code: "34710",
    })
    expect(ist.ok && ist.normalized.city_code).toBe("34")
  })

  it("ilçe ilin listesinde olmalı", () => {
    expect(fail({ district: "" })).toMatchObject({ field: "district", message: "İlçe seçin." })
    expect(fail({ district: "Kadıköy" })).toMatchObject({
      field: "district",
      message: "Trabzon için listeden bir ilçe seçin.",
    })
    expect(fail({ district: "ortahisar" }).field).toBe("district")
  })

  it("mahalle zorunlu", () => {
    expect(fail({ neighbourhood: " " })).toMatchObject({ field: "neighbourhood" })
  })

  it("açık adres yalnız konum adıysa engellenir", () => {
    expect(fail({ address_1: "Kemerkaya Mahallesi" })).toMatchObject({
      field: "address_1",
      message: ADDRESS_LINE_HINT,
    })
  })

  it("posta kodu 5 hane ve geçerli il kodu", () => {
    for (const postal_code of ["6103", "610300", "00000", "99000", "", "abcde"]) {
      expect(fail({ postal_code })).toMatchObject({
        field: "postal_code",
        message: "Posta kodu 5 haneli olmalıdır.",
      })
    }
  })

  it("telefon E.164'e çevrilir veya reddedilir", () => {
    const ok = validateCheckoutAddress({ ...base, phone: "+90 (555) 111 22 33" })
    expect(ok.ok && ok.normalized.phone).toBe("+905551112233")
    expect(fail({ phone: "555 111 22" })).toMatchObject({
      field: "phone",
      message: "Geçerli bir telefon numarası girin.",
    })
  })

  it("bireysel: TCKN opsiyonel, girilirse 11 hane", () => {
    expect(fail({ tckn: "1234567890" })).toMatchObject({ field: "tckn" })
    const r = validateCheckoutAddress({ ...base, tckn: "100 000 001 46", vkn: "1234567890" })
    expect(r.ok && r.normalized.tckn).toBe("10000000146")
    // Bireyselde VKN / unvan yazılmaz
    expect(r.ok && r.normalized.vkn).toBeUndefined()
    expect(r.ok && r.normalized.company_name).toBeUndefined()
  })

  it("kontrol basamağı tutmayan TCKN / VKN ayrı mesajla reddedilir", () => {
    expect(fail({ tckn: "10000000147" })).toMatchObject({
      field: "tckn",
      message: "TCKN doğrulanamadı; rakamları kontrol edin.",
    })
    expect(
      fail({ invoice_type: "corporate", vkn: "1234567891", tax_office: "Uzun", company_name: "X" })
    ).toMatchObject({ field: "vkn", message: "VKN doğrulanamadı; rakamları kontrol edin." })
  })

  it("sunucu kuralı: mahalle ve ilçe opsiyonel, kimlik kuralları aynı", () => {
    const server = { requireNeighbourhood: false, requireDistrict: false }
    const r = validateCheckoutAddress({ ...base, neighbourhood: "", district: "" }, server)
    expect(r.ok && r.normalized.neighbourhood).toBe("")
    // Yazılmışsa yine listede olmalı
    const bad = validateCheckoutAddress({ ...base, neighbourhood: "", district: "Kadıköy" }, server)
    expect(bad.ok).toBe(false)
    const badId = validateCheckoutAddress({ ...base, neighbourhood: "", tckn: "10000000147" }, server)
    expect(badId.ok).toBe(false)
  })

  it("bilinmeyen invoice_type bireysel sayılır", () => {
    const r = validateCheckoutAddress({
      ...base,
      invoice_type: "kurumsal" as unknown as "corporate",
    })
    expect(r.ok && r.normalized.invoice_type).toBe("individual")
  })

  it("kurumsal: VKN → vergi dairesi → unvan zorunlu", () => {
    const corp = { ...base, invoice_type: "corporate" as const }
    expect(fail({ ...corp, vkn: "123" })).toMatchObject({
      field: "vkn",
      message: "Kurumsal fatura için 10 haneli VKN girin.",
    })
    expect(fail({ ...corp, vkn: "1234567890" })).toMatchObject({ field: "tax_office" })
    expect(fail({ ...corp, vkn: "1234567890", tax_office: "Uzun" })).toMatchObject({
      field: "company_name",
    })
    const r = validateCheckoutAddress({
      ...corp,
      vkn: "123-456-7890",
      tckn: "10000000146",
      tax_office: " Uzun ",
      company_name: " Hamzalı Çay A.Ş. ",
    })
    expect(r.ok && r.normalized).toMatchObject({
      invoice_type: "corporate",
      vkn: "1234567890",
      tckn: undefined,
      tax_office: "Uzun",
      company_name: "Hamzalı Çay A.Ş.",
    })
  })

  it("country_code küçük harfe çevrilir", () => {
    const r = validateCheckoutAddress({ ...base, country_code: "TR" })
    expect(r.ok && r.normalized.country_code).toBe("tr")
  })
})

describe("buildBillingInvoiceMetadata", () => {
  it("bireysel + TCKN + e-posta", () => {
    const r = validateCheckoutAddress({ ...base, tckn: "10000000146" })
    if (!r.ok) throw new Error("geçersiz")
    expect(buildBillingInvoiceMetadata(r.normalized, " a@b.com ")).toEqual({
      district: "Ortahisar",
      neighbourhood: "Kemerkaya",
      city_code: "61",
      invoice_type: "individual",
      email: "a@b.com",
      tckn: "10000000146",
    })
  })

  it("kurumsal: vkn + tax_office + company_name; boş e-posta yazılmaz", () => {
    const r = validateCheckoutAddress({
      ...base,
      invoice_type: "corporate",
      vkn: "1234567890",
      tax_office: "Uzun",
      company_name: "Es Çay",
    })
    if (!r.ok) throw new Error("geçersiz")
    expect(buildBillingInvoiceMetadata(r.normalized, "  ")).toEqual({
      district: "Ortahisar",
      neighbourhood: "Kemerkaya",
      city_code: "61",
      invoice_type: "corporate",
      vkn: "1234567890",
      tax_office: "Uzun",
      company_name: "Es Çay",
    })
  })
})

describe("listTrDistricts (re-export)", () => {
  it("Trabzon ilçeleri; bilinmeyen kod boş", () => {
    expect(listTrDistricts("61")).toContain("Hayrat")
    expect(listTrDistricts("61")).toHaveLength(18)
    expect(listTrDistricts("99")).toEqual([])
    expect(listTrDistricts(null)).toEqual([])
  })
})
