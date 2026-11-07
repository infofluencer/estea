import {
  checkoutInputFromMedusaAddress,
  validateCheckoutAddress,
} from "@escay/shared/checkout-address"

/** completeCart hook'unun uyguladığı sunucu kuralları (hooks/validate-cart-checkout.ts). */
const SHIPPING_RULES = { requireNeighbourhood: false }
const BILLING_RULES = { requireNeighbourhood: false, requireDistrict: false }

/** Smoke betiklerinin gönderdiği adres (mahallesiz, billing metadata'sız). */
const smokeShipping = {
  first_name: "Full",
  last_name: "Flow",
  address_1: "Smoke Cad. No:1",
  city: "İstanbul",
  country_code: "tr",
  postal_code: "34000",
  phone: "+905551112233",
  province: "İstanbul",
  metadata: { district: "Şişli" },
}
const { metadata: _m, ...smokeBilling } = smokeShipping

describe("checkoutInputFromMedusaAddress", () => {
  it("ilçe metadata.district, yoksa province; mahalle metadata.neighbourhood, yoksa address_2", () => {
    expect(checkoutInputFromMedusaAddress(smokeShipping)).toMatchObject({
      district: "Şişli",
      neighbourhood: "",
      country_code: "tr",
    })
    // Betikler province'a il adını yazar: ilçe sayılmaz
    expect(checkoutInputFromMedusaAddress(smokeBilling).district).toBe("")
    expect(
      checkoutInputFromMedusaAddress({ ...smokeBilling, province: "Kadıköy", address_2: "Caferağa" })
    ).toMatchObject({ district: "Kadıköy", neighbourhood: "Caferağa" })
  })

  it("fatura kimliği yalnız istenince ve yalnız metadata'dan okunur", () => {
    const meta = { invoice_type: "corporate", vkn: "1234567890", tax_office: "Uzun", company_name: "X" }
    expect(checkoutInputFromMedusaAddress({ ...smokeBilling, metadata: meta }).invoice_type).toBeUndefined()
    expect(
      checkoutInputFromMedusaAddress({ ...smokeBilling, metadata: meta }, { withInvoiceIdentity: true })
    ).toMatchObject({ invoice_type: "corporate", vkn: "1234567890", tax_office: "Uzun", company_name: "X" })
    expect(
      checkoutInputFromMedusaAddress({ ...smokeBilling, metadata: { tax_number: "1234567890" } }, { withInvoiceIdentity: true })
    ).toMatchObject({ invoice_type: "individual", vkn: "1234567890" })
  })
})

describe("sunucu kuralları (hook)", () => {
  it("smoke betiği adresi geçer: teslimat mahallesiz, fatura metadata'sız", () => {
    expect(validateCheckoutAddress(checkoutInputFromMedusaAddress(smokeShipping), SHIPPING_RULES).ok).toBe(true)
    expect(
      validateCheckoutAddress(
        checkoutInputFromMedusaAddress(smokeBilling, { withInvoiceIdentity: true }),
        BILLING_RULES
      ).ok
    ).toBe(true)
  })

  it("API'den gelen eksik adres kesilir: ilçesiz teslimat, resmi olmayan il, kısa telefon", () => {
    expect(validateCheckoutAddress(checkoutInputFromMedusaAddress(smokeBilling), SHIPPING_RULES)).toMatchObject({
      ok: false,
      field: "district",
    })
    expect(
      validateCheckoutAddress(checkoutInputFromMedusaAddress({ ...smokeShipping, city: "Istanbul" }), SHIPPING_RULES)
    ).toMatchObject({ ok: false, field: "city" })
    expect(
      validateCheckoutAddress(checkoutInputFromMedusaAddress({ ...smokeShipping, phone: "555" }), SHIPPING_RULES)
    ).toMatchObject({ ok: false, field: "phone" })
  })

  it("fatura kimliği: kontrol basamağı tutmayan VKN / TCKN kesilir", () => {
    const corporate = {
      ...smokeBilling,
      metadata: { invoice_type: "corporate", vkn: "1234567891", tax_office: "Uzun", company_name: "X" },
    }
    expect(
      validateCheckoutAddress(checkoutInputFromMedusaAddress(corporate, { withInvoiceIdentity: true }), BILLING_RULES)
    ).toMatchObject({ ok: false, field: "vkn" })

    const individual = { ...smokeBilling, metadata: { invoice_type: "individual", tckn: "10000000147" } }
    expect(
      validateCheckoutAddress(checkoutInputFromMedusaAddress(individual, { withInvoiceIdentity: true }), BILLING_RULES)
    ).toMatchObject({ ok: false, field: "tckn" })

    const corporateNoOffice = {
      ...smokeBilling,
      metadata: { invoice_type: "corporate", vkn: "1234567890", company_name: "X" },
    }
    expect(
      validateCheckoutAddress(checkoutInputFromMedusaAddress(corporateNoOffice, { withInvoiceIdentity: true }), BILLING_RULES)
    ).toMatchObject({ ok: false, field: "tax_office" })
  })
})
