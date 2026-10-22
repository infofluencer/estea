import { mapItems, mapRecipientAddress, type MedusaAddressLike } from "../recipient"

const baseAddress: MedusaAddressLike = {
  first_name: "Ayşe",
  last_name: "Güngör",
  address_1: "Bağdat Caddesi No:12 D:3",
  address_2: "Kadıköy",
  city: "İstanbul",
  postal_code: "34710",
  phone: "0555 111 22 33",
  country_code: "tr",
}

describe("mapRecipientAddress — TR adres eşlemesi", () => {
  it("checkout'un topladığı alanlardan geçerli bir alıcı üretir", () => {
    const result = mapRecipientAddress(baseAddress, "ayse@example.com")
    expect(result.missing).toEqual([])
    expect(result.value).toEqual({
      name: "Ayşe Güngör",
      email: "ayse@example.com",
      phone: "+905551112233",
      address1: "Bağdat Caddesi No:12 D:3",
      countryCode: "TR",
      cityName: "İstanbul",
      cityCode: "34",
      districtName: "Kadıköy",
      zip: "34710",
    })
  })

  it("address_2 ilçe olarak kullanıldığında adres satırında tekrarlanmaz", () => {
    const result = mapRecipientAddress(baseAddress, "ayse@example.com")
    expect(result.value.address2).toBeUndefined()
  })

  it("metadata.district / city_code (checkout seçicileri) address_2 ve posta kodundan önce gelir", () => {
    const result = mapRecipientAddress(
      { ...baseAddress, address_2: "3. kat", postal_code: "06000", metadata: { district: "Maltepe", city_code: "34" } },
      "ayse@example.com",
      { defaultDistrict: "Merkez" }
    )
    expect(result.missing).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.value.districtName).toBe("Maltepe")
    expect(result.value.cityCode).toBe("34")
    expect(result.value.address2).toBe("3. kat")
  })

  it("telefon formatları normalize edilir (0555, 532, +90)", () => {
    for (const [phone, expected] of [
      ["0555 111 22 33", "+905551112233"],
      ["5321112233", "+905321112233"],
      ["+90 532 111 22 33", "+905321112233"],
    ] as const) {
      const result = mapRecipientAddress({ ...baseAddress, phone }, "ayse@example.com")
      expect(result.missing).not.toContain("phone")
      expect(result.value.phone).toBe(expected)
    }
  })

  it("province il olarak çözümlenirse ilçe sayılmaz, il kaynağı olur", () => {
    const result = mapRecipientAddress({ ...baseAddress, city: "", province: "TR-34" }, "ayse@example.com")
    expect(result.value.cityCode).toBe("34")
    expect(result.value.cityName).toBe("İstanbul")
    expect(result.value.districtName).toBe("Kadıköy")
  })

  it("ilçe hiçbir yerden gelmezse uydurmaz; defaultDistrict verilirse uyarıyla kullanır", () => {
    const none = mapRecipientAddress({ ...baseAddress, address_2: null }, "ayse@example.com")
    expect(none.missing).toContain("districtName")

    const withDefault = mapRecipientAddress({ ...baseAddress, address_2: null }, "ayse@example.com", { defaultDistrict: "Merkez" })
    expect(withDefault.missing).toEqual([])
    expect(withDefault.value.districtName).toBe("Merkez")
    expect(withDefault.warnings.join(" ")).toContain("varsayılan ilçe")
  })

  it("yabancı posta kodu TR iline eşlenmez", () => {
    const result = mapRecipientAddress(
      { ...baseAddress, city: "Berlin", address_2: "Mitte", postal_code: "10115", country_code: "de" },
      "ayse@example.com"
    )
    expect(result.missing).toContain("cityCode")
    expect(result.warnings.join(" ")).toContain('Ülke kodu "DE"')
  })

  it("eksik alanları tek tek raporlar", () => {
    const result = mapRecipientAddress({ city: "İstanbul" }, "")
    expect(result.missing).toEqual(expect.arrayContaining(["name", "email", "phone", "address1", "districtName"]))
  })
})

describe("mapItems", () => {
  it("başlık + varyant, SKU ve adet", () => {
    expect(
      mapItems([
        { title: "Rize Çayı", variant_title: "500 g", variant_sku: "RZ-500", quantity: 2, unit_price: 189.9 },
        { title: "Yeşil Çay", variant_title: "Default variant", quantity: 0 },
      ])
    ).toEqual([
      { title: "Rize Çayı - 500 g", sku: "RZ-500", quantity: 2, unitPrice: 189.9 },
      { title: "Yeşil Çay", quantity: 1 },
    ])
  })
})
