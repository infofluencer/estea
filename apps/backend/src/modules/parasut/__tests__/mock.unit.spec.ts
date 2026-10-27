import { ParasutClient } from "../client"
import {
  mockCreateRefundInvoice,
  mockFinalizeInvoice,
  resolveMockInvoiceType,
} from "../mock"
import { isMockMode, normalizeOptions } from "../options"

describe("parasut options mock mode", () => {
  it("treats empty credentials as mock", () => {
    const opts = normalizeOptions({})
    expect(isMockMode(opts)).toBe(true)
  })

  it("treats filled credentials as live", () => {
    const opts = normalizeOptions({
      clientId: "cid",
      clientSecret: "secret",
      username: "user@example.com",
      password: "pass",
      companyId: "12345",
      env: "prod",
    })
    expect(isMockMode(opts)).toBe(false)
    expect(opts.env).toBe("prod")
    expect(opts.defaultVatRate).toBe(10)
    expect(opts.shippingVatRate).toBe(20)
    expect(opts.dryRun).toBe(false)
  })
})

describe("parasut mock invoice flow", () => {
  it("defaults to e_archive for consumers (no VKN)", () => {
    expect(resolveMockInvoiceType(null)).toBe("e_archive")
    expect(resolveMockInvoiceType("12345678901")).toBe("e_archive")
    expect(resolveMockInvoiceType("1234567890")).toBe("e_archive")
  })

  it("treats 10-digit VKN starting with 9 as e_invoice (mock registered)", () => {
    expect(resolveMockInvoiceType("9123456789")).toBe("e_invoice")
  })

  it("mock finalize returns invoice number", () => {
    const r = mockFinalizeInvoice({
      invoiceId: "mock-inv-1",
      orderId: "order_abc",
      taxNumber: null,
    })
    expect(r.mock).toBe(true)
    expect(r.invoiceType).toBe("e_archive")
    expect(r.invoiceNumber).toMatch(/^EA-MOCK-/)
  })

  it("mock finalize e_invoice for registered VKN", () => {
    const r = mockFinalizeInvoice({
      invoiceId: "mock-inv-2",
      orderId: "order_ef",
      taxNumber: "9123456789",
    })
    expect(r.invoiceType).toBe("e_invoice")
    expect(r.invoiceNumber).toMatch(/^EF-MOCK-/)
  })

  it("client in mock mode never needs transport", async () => {
    const client = new ParasutClient({
      ...normalizeOptions({}),
      forceMock: true,
    })
    expect(client.mockMode).toBe(true)

    const contact = await client.ensureContact({
      name: "Ayşe",
      email: "a@example.com",
      orderId: "ord_1",
    })
    const sales = await client.createSalesInvoice({
      contactId: contact.contactId,
      orderId: "ord_1",
      lines: [
        {
          description: "Siyah Çay",
          quantity: 1,
          unitPrice: 999,
          vatRate: 10,
        },
      ],
    })
    const formal = await client.finalizeInvoice({
      invoiceId: sales.invoiceId,
      orderId: "ord_1",
    })
    const pdf = await client.getInvoicePdf(sales.invoiceId)

    expect(contact.contactId).toContain("mock-contact")
    expect(sales.invoiceId).toContain("mock-inv")
    expect(formal.invoiceNumber).toBeTruthy()
    expect(pdf.pdfUrl).toContain("mock.parasut.local")
  })

  it("mock refund invoice is idempotent-shaped", () => {
    const a = mockCreateRefundInvoice({
      originalInvoiceId: "mock-inv-1",
      orderId: "ord_1",
      returnId: "ret_xyz",
      amount: 100,
    })
    const b = mockCreateRefundInvoice({
      originalInvoiceId: "mock-inv-1",
      orderId: "ord_1",
      returnId: "ret_xyz",
      amount: 100,
    })
    expect(a.refundInvoiceId).toBe(b.refundInvoiceId)
    expect(a.invoiceNumber).toBe(b.invoiceNumber)
  })
})
