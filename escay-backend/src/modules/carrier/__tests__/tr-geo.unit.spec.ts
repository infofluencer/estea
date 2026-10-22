import {
  foldTr,
  normalizeTrPhone,
  resolveTrCity,
  resolveTrCityFromPostalCode,
  TR_CITIES,
} from "../tr-geo"

describe("foldTr", () => {
  it("Türkçe büyük İ'yi birleşik işaret bırakmadan katlar", () => {
    // JS'in kendi toLowerCase'i "İ" için i + U+0307 üretir; bu regresyonu korur.
    expect("İstanbul".toLowerCase()).not.toBe("istanbul")
    expect(foldTr("İstanbul")).toBe("istanbul")
    expect(foldTr("ISTANBUL")).toBe("istanbul")
    expect(foldTr("istanbul")).toBe("istanbul")
  })

  it("tüm Türkçe harfleri ASCII karşılığına katlar", () => {
    expect(foldTr("ŞĞİÇÖÜ şğıçöü")).toBe("sgicousgicou")
  })

  it("noktalama ve boşlukları atar", () => {
    expect(foldTr("K. Maraş")).toBe("kmaras")
    expect(foldTr("  Afyon-Karahisar ")).toBe("afyonkarahisar")
  })
})

describe("resolveTrCity", () => {
  it("Türkçe karakterli il adını doğru plakaya çevirir", () => {
    expect(resolveTrCity("İstanbul")).toEqual({
      cityCode: "34",
      cityName: "İstanbul",
    })
    expect(resolveTrCity("İzmir")).toEqual({ cityCode: "35", cityName: "İzmir" })
    expect(resolveTrCity("Şanlıurfa")).toEqual({
      cityCode: "63",
      cityName: "Şanlıurfa",
    })
    expect(resolveTrCity("Muğla")).toEqual({ cityCode: "48", cityName: "Muğla" })
  })

  it("ASCII ve yanlış büyük/küçük harfli yazımları da çözer", () => {
    // Storefront'ta müşteri "istanbul" da yazabilir "ISTANBUL" da.
    expect(resolveTrCity("istanbul")?.cityCode).toBe("34")
    expect(resolveTrCity("ISTANBUL")?.cityCode).toBe("34")
    expect(resolveTrCity("Canakkale")?.cityCode).toBe("17")
    expect(resolveTrCity("Kahramanmaras")?.cityCode).toBe("46")
  })

  it("çözümlenen il adını her zaman resmi Türkçe yazımıyla döndürür", () => {
    expect(resolveTrCity("canakkale")?.cityName).toBe("Çanakkale")
    expect(resolveTrCity("eskisehir")?.cityName).toBe("Eskişehir")
  })

  it("plaka kodu ve ISO 3166-2 biçimlerini kabul eder", () => {
    expect(resolveTrCity("34")?.cityName).toBe("İstanbul")
    expect(resolveTrCity("06")?.cityName).toBe("Ankara")
    expect(resolveTrCity("6")?.cityName).toBe("Ankara")
    expect(resolveTrCity("TR-34")?.cityCode).toBe("34")
    expect(resolveTrCity("tr-35")?.cityCode).toBe("35")
  })

  it("yaygın kısaltmaları çözer", () => {
    expect(resolveTrCity("Afyon")?.cityCode).toBe("03")
    expect(resolveTrCity("İçel")?.cityCode).toBe("33")
    expect(resolveTrCity("Antep")?.cityCode).toBe("27")
  })

  it("çözemediğinde uydurmaz", () => {
    expect(resolveTrCity("Kadıköy")).toBeNull() // ilçe, il değil
    expect(resolveTrCity("Berlin")).toBeNull()
    expect(resolveTrCity("99")).toBeNull()
    expect(resolveTrCity("")).toBeNull()
    expect(resolveTrCity(null)).toBeNull()
  })

  it("81 ilin tamamı kendi adından geri çözümlenebilir", () => {
    for (const [code, name] of Object.entries(TR_CITIES)) {
      expect(resolveTrCity(name)).toEqual({ cityCode: code, cityName: name })
    }
    expect(Object.keys(TR_CITIES)).toHaveLength(81)
  })
})

describe("resolveTrCityFromPostalCode", () => {
  it("posta kodunun ilk iki hanesinden ili bulur", () => {
    expect(resolveTrCityFromPostalCode("34710")?.cityName).toBe("İstanbul")
    expect(resolveTrCityFromPostalCode("06510")?.cityName).toBe("Ankara")
    expect(resolveTrCityFromPostalCode("35220")?.cityName).toBe("İzmir")
  })

  it("geçersiz posta kodunda null döner", () => {
    expect(resolveTrCityFromPostalCode("123")).toBeNull()
    expect(resolveTrCityFromPostalCode("99999")).toBeNull()
    expect(resolveTrCityFromPostalCode("")).toBeNull()
  })
})

describe("normalizeTrPhone", () => {
  it("yaygın TR yazımlarını +90 formatına çevirir", () => {
    expect(normalizeTrPhone("0555 111 22 33")).toBe("+905551112233")
    expect(normalizeTrPhone("+90 555 111 22 33")).toBe("+905551112233")
    expect(normalizeTrPhone("905551112233")).toBe("+905551112233")
    expect(normalizeTrPhone("5551112233")).toBe("+905551112233")
    expect(normalizeTrPhone("(0555) 111-22-33")).toBe("+905551112233")
  })

  it("çözemediğinde null döner", () => {
    expect(normalizeTrPhone("123")).toBeNull()
    expect(normalizeTrPhone("")).toBeNull()
    expect(normalizeTrPhone(null)).toBeNull()
  })
})
