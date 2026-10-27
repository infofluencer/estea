import {
  DEFAULT_PACKAGE_PROFILE,
  parsePackageProfile,
  readItemWeightKg,
  resolvePackage,
} from "../package-profile"

describe("parsePackageProfile", () => {
  it("boş/eksik değerde çay varsayılanına düşer", () => {
    expect(parsePackageProfile(undefined)).toEqual(DEFAULT_PACKAGE_PROFILE)
    expect(parsePackageProfile("")).toEqual(DEFAULT_PACKAGE_PROFILE)
    expect(parsePackageProfile(null)).toEqual(DEFAULT_PACKAGE_PROFILE)
  })

  it("varsayılan profil çay kolisi (30×20×15, 0,5 kg, maxHeight 45)", () => {
    expect(DEFAULT_PACKAGE_PROFILE).toEqual({
      weight: 0.5,
      length: 30,
      width: 20,
      height: 15,
      maxHeight: 45,
    })
  })

  it("geçerli JSON'u ayrıştırır", () => {
    expect(
      parsePackageProfile(
        '{"weight":1.2,"length":30,"width":22,"height":8,"maxHeight":50}'
      )
    ).toEqual({ weight: 1.2, length: 30, width: 22, height: 8, maxHeight: 50 })
  })

  it("bozuk JSON'da kargo akışını kırmaz", () => {
    expect(parsePackageProfile("{bozuk")).toEqual(DEFAULT_PACKAGE_PROFILE)
    expect(parsePackageProfile("null")).toEqual(DEFAULT_PACKAGE_PROFILE)
  })

  it("geçersiz alanları tek tek varsayılana düşürür", () => {
    const profile = parsePackageProfile(
      '{"weight":-1,"length":"abc","width":22,"height":0}'
    )
    expect(profile).toEqual({
      weight: DEFAULT_PACKAGE_PROFILE.weight,
      length: DEFAULT_PACKAGE_PROFILE.length,
      width: 22,
      height: DEFAULT_PACKAGE_PROFILE.height,
      maxHeight: DEFAULT_PACKAGE_PROFILE.maxHeight,
    })
  })

  it("sayısal string değerleri kabul eder", () => {
    expect(parsePackageProfile('{"weight":"0.75"}').weight).toBe(0.75)
  })
})

describe("readItemWeightKg", () => {
  it("weight_kg'yi kilogram olarak okur", () => {
    expect(readItemWeightKg({ weight_kg: 1.5 })).toBe(1.5)
  })

  it("weight/weight_g'yi gram kabul eder (Medusa varyant konvansiyonu)", () => {
    expect(readItemWeightKg({ weight_g: 250 })).toBe(0.25)
    expect(readItemWeightKg({ weight: 300 })).toBe(0.3)
  })

  it("weight_kg diğerlerinden önceliklidir", () => {
    expect(readItemWeightKg({ weight_kg: 2, weight: 300 })).toBe(2)
  })

  it("veri yoksa null döner", () => {
    expect(readItemWeightKg(null)).toBeNull()
    expect(readItemWeightKg({})).toBeNull()
    expect(readItemWeightKg({ weight: 0 })).toBeNull()
  })
})

describe("resolvePackage — ürün ağırlığı olmayan katalog için", () => {
  it("hiç ağırlık verisi yoksa varsayılan koliye düşer", () => {
    const parcel = resolvePackage([{ quantity: 1 }])

    expect(parcel).toMatchObject({
      weight: 0.5,
      length: 30,
      width: 20,
      height: 15,
      totalUnits: 1,
      weightSource: "default",
      dimensionsSource: "default",
    })
  })

  it("adet arttıkça ağırlık orantılı büyür", () => {
    const parcel = resolvePackage([{ quantity: 3 }])
    expect(parcel.weight).toBe(1.5)
    expect(parcel.totalUnits).toBe(3)
  })

  it("varsayılan kolide yükseklik adetle istiflenir, 45 cm'de (9 desi) durur", () => {
    for (const [quantity, desi] of [
      [1, 3],
      [2, 6],
      [3, 9],
      [10, 9],
    ] as const) {
      const p = resolvePackage([{ quantity }])
      expect((p.length * p.width * p.height) / 3000).toBe(desi)
    }
  })

  it("yükseklik istiflemeyle büyür ama maxHeight'ı aşmaz (istifli profil)", () => {
    const stacked = { weight: 0.5, length: 25, width: 20, height: 5, maxHeight: 40 }
    // 5cm × 4 adet = 20cm
    expect(resolvePackage([{ quantity: 4 }], stacked).height).toBe(20)
    // 5cm × 20 adet = 100cm → 40cm'e sınırlanır
    expect(resolvePackage([{ quantity: 20 }], stacked).height).toBe(40)
  })

  it("kalem metadata'sındaki ağırlığı kullanır ve kaynağı raporlar", () => {
    const parcel = resolvePackage([
      { quantity: 2, metadata: { weight_kg: 0.3 } },
      { quantity: 1, metadata: { weight_g: 400 } },
    ])

    expect(parcel.weight).toBe(1) // 0.3*2 + 0.4
    expect(parcel.weightSource).toBe("items")
  })

  it("ağırlığı olan ve olmayan kalemleri karıştırabilir", () => {
    const parcel = resolvePackage([
      { quantity: 1, metadata: { weight_kg: 0.2 } },
      { quantity: 1 }, // varsayılan 0.5
    ])

    expect(parcel.weight).toBe(0.7)
    expect(parcel.weightSource).toBe("items")
  })

  it("hesaplanan ağırlık asla profil minimumunun altına inmez", () => {
    const parcel = resolvePackage([{ quantity: 1, metadata: { weight_g: 10 } }])
    expect(parcel.weight).toBe(0.5)
  })

  it("kalemde açık boyut varsa her eksende en büyüğünü alır", () => {
    const parcel = resolvePackage([
      { quantity: 1, metadata: { length: 30, width: 18, height: 6 } },
      { quantity: 1, metadata: { length: 26, width: 24, height: 4 } },
    ])

    expect(parcel.length).toBe(30)
    expect(parcel.width).toBe(24)
    expect(parcel.dimensionsSource).toBe("items")
  })

  it("özel profille çalışır", () => {
    const parcel = resolvePackage([{ quantity: 2 }], {
      weight: 1,
      length: 40,
      width: 30,
      height: 10,
      maxHeight: 15,
    })

    expect(parcel).toMatchObject({ weight: 2, length: 40, width: 30, height: 15 })
  })

  it("boş kalem listesinde bile geçerli bir paket üretir", () => {
    const parcel = resolvePackage([])
    expect(parcel.weight).toBe(0.5)
    expect(parcel.totalUnits).toBe(1)
  })

  it("bozuk adet değerlerini en az 1'e normalize eder", () => {
    expect(resolvePackage([{ quantity: 0 }]).totalUnits).toBe(1)
    expect(resolvePackage([{ quantity: null }]).totalUnits).toBe(1)
  })
})
