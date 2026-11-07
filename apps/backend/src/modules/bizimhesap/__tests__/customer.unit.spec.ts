import { normalizeTaxNumber, resolveInvoiceCustomer } from "../customer"

const addr = {
  first_name: "Ayşe",
  last_name: "Yılmaz",
  phone: "+905551112233",
  city: "Trabzon",
  address_1: "Uzun Sk. No:12 D:3",
  address_2: "Kemerkaya",
}

const customer = {
  id: "cus_1",
  email: "card@example.com",
  first_name: "Kart",
  last_name: "Adı",
  // Müşterinin kendi kartına yazabildiği eski şirket bilgisi
  metadata: { company_name: "Eski Şirket Ltd.", vkn: "9876543210", tax_office: "Eski VD" },
}

describe("normalizeTaxNumber", () => {
  it("tam 10 ya da 11 hane; 12 hane kimlik değildir", () => {
    expect(normalizeTaxNumber("123 456 7890")).toBe("1234567890")
    expect(normalizeTaxNumber("10000000146")).toBe("10000000146")
    expect(normalizeTaxNumber("123456789012")).toBeNull()
    expect(normalizeTaxNumber("123456789")).toBeNull()
    expect(normalizeTaxNumber(1234567890)).toBeNull()
    expect(normalizeTaxNumber("10000000146", [10])).toBeNull()
  })
})

describe("resolveInvoiceCustomer", () => {
  it("bireysel: fatura adresinin TCKN'si; müşteri kartındaki şirket yok sayılır", () => {
    const r = resolveInvoiceCustomer({
      id: "order_1",
      email: "siparis@example.com",
      customer,
      shipping_address: addr,
      billing_address: {
        ...addr,
        metadata: { invoice_type: "individual", tckn: "10000000146", district: "Ortahisar", neighbourhood: "Kemerkaya" },
      },
    })
    expect(r.invoiceType).toBe("individual")
    expect(r.taxNo).toBe("10000000146")
    expect(r.customer).toEqual({
      customerId: "cus_1",
      title: "Ayşe Yılmaz",
      address: "Uzun Sk. No:12 D:3, Kemerkaya, Ortahisar, Trabzon",
      taxOffice: null,
      taxNo: "10000000146",
      email: "siparis@example.com",
      phone: "+905551112233",
    })
  })

  it("bireysel TCKN'siz: taxNo yok, unvan/vergi dairesi yok", () => {
    const r = resolveInvoiceCustomer({
      id: "order_2",
      customer,
      billing_address: { ...addr, metadata: { invoice_type: "individual" } },
    })
    expect(r.taxNo).toBeNull()
    expect(r.customer.taxOffice).toBeNull()
    expect(r.customer.title).toBe("Ayşe Yılmaz")
  })

  it("kurumsal: fatura adresindeki VKN + unvan + vergi dairesi; TCKN anahtarı okunmaz", () => {
    const r = resolveInvoiceCustomer({
      id: "order_3",
      customer,
      billing_address: {
        ...addr,
        metadata: {
          invoice_type: "corporate",
          vkn: "1234567890",
          tckn: "10000000146",
          tax_office: "Uzun",
          company_name: "Hamzalı Çay A.Ş.",
          district: "Ortahisar",
        },
      },
    })
    expect(r).toMatchObject({
      invoiceType: "corporate",
      taxNo: "1234567890",
      customer: { title: "Hamzalı Çay A.Ş.", taxOffice: "Uzun", taxNo: "1234567890" },
    })
  })

  it("kurumsal: 11 haneli değer VKN alanında kimlik sayılmaz", () => {
    const r = resolveInvoiceCustomer({
      id: "order_4",
      billing_address: { ...addr, metadata: { invoice_type: "corporate", vkn: "10000000146", company_name: "X" } },
    })
    expect(r.taxNo).toBeNull()
  })

  it("invoice_type yok (eski sipariş): eski sıra, müşteri kartı en sonda", () => {
    const r = resolveInvoiceCustomer({
      id: "order_5",
      customer,
      metadata: { tax_number: "5555555555" },
      billing_address: { ...addr, metadata: { district: "Ortahisar" } },
    })
    expect(r.invoiceType).toBe("unknown")
    expect(r.taxNo).toBe("5555555555")
    expect(r.customer.title).toBe("Eski Şirket Ltd.")

    const onlyCard = resolveInvoiceCustomer({ id: "order_6", customer, billing_address: addr })
    expect(onlyCard.taxNo).toBe("9876543210")
  })

  it("adres yok: müşteri adı → e-posta → Müşteri; customerId sipariş kimliğine düşer", () => {
    expect(resolveInvoiceCustomer({ id: "order_7", customer: { ...customer, metadata: null } }).customer).toMatchObject({
      customerId: "cus_1",
      title: "Kart Adı",
      address: "",
    })
    expect(resolveInvoiceCustomer({ id: "order_8", email: "x@y.z" }).customer).toMatchObject({
      customerId: "order_8",
      title: "x@y.z",
    })
    expect(resolveInvoiceCustomer({ id: "order_9" }).customer.title).toBe("Müşteri")
  })
})
