import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BIZIMHESAP_MODULE } from "../../modules/bizimhesap"
import BizimhesapModuleService from "../../modules/bizimhesap/service"
import { buildInvoiceNote, issueSalesInvoiceForOrder } from "../bizimhesap-invoice"
import { flagRefundInvoiceForReturn } from "../bizimhesap-refund-invoice"
import { notifyBizimhesapInvoiceProblem, notifyManualRefundInvoice } from "../bizimhesap-invoice-admin-notify"
import { recordOpsEvent } from "../ops-events"

jest.mock("../bizimhesap-invoice-admin-notify", () => ({
  notifyBizimhesapInvoiceProblem: jest.fn().mockResolvedValue({ sent: true }),
  notifyManualRefundInvoice: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("../ops-events", () => ({
  recordOpsEvent: jest.fn().mockResolvedValue(undefined),
}))

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const realFetch = globalThis.fetch

type FakeOrder = Record<string, unknown> & { metadata: Record<string, unknown> | null }

function baseOrder(overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: "order_1",
    display_id: 1,
    status: "pending",
    email: "ayse@example.com",
    currency_code: "try",
    metadata: null,
    total: 184.9,
    shipping_total: 149.9,
    items: [
      {
        title: "Papatya Çayı",
        detail: { quantity: 1 },
        unit_price: 35,
        is_tax_inclusive: true,
        variant_sku: "ESC-PAPATYA-BP",
        variant_id: "var_1",
        discount_total: 0,
        tax_lines: [{ rate: 1 }],
      },
    ],
    shipping_address: {
      first_name: "Ayşe",
      last_name: "Yılmaz",
      phone: "+905000000000",
      city: "Sakarya",
      address_1: "Yeni Mah. 1",
      metadata: { district: "Adapazarı" },
    },
    customer: { id: "cus_1", email: "ayse@example.com" },
    ...overrides,
  }
}

function makeScope(
  order: FakeOrder,
  firmId = "GERCEK",
  returnMeta: Record<string, unknown> | null = null
) {
  const service = new BizimhesapModuleService({ logger } as never, { firmId })
  const scope = {
    resolve: (key: string) => {
      switch (key) {
        case ContainerRegistrationKeys.LOGGER:
          return logger
        case ContainerRegistrationKeys.QUERY:
          return {
            graph: async ({ entity }: { entity: string }) =>
              entity === "return"
                ? { data: [{ id: "ret_1", metadata: returnMeta }] }
                : { data: [order] },
          }
        case Modules.LOCKING:
          return { execute: (_k: string, job: () => unknown) => job() }
        case Modules.ORDER:
          return {
            updateOrders: async ([u]: { metadata: Record<string, unknown> }[]) => {
              order.metadata = u.metadata
            },
          }
        case BIZIMHESAP_MODULE:
          return service
        default:
          throw new Error(`unexpected resolve ${key}`)
      }
    },
  }
  return { scope: scope as never }
}

function mockFetch(impl: () => Promise<unknown>) {
  const fn = jest.fn(impl)
  globalThis.fetch = fn as never
  return fn
}

const okResponse = () =>
  Promise.resolve({
    status: 200,
    text: async () => '{"error":"","guid":"G1","url":"https://bizimhesap.com/x"}',
  })

const invoiceOf = (order: FakeOrder) =>
  order.metadata?.bizimhesap_invoice as Record<string, unknown>

describe("issueSalesInvoiceForOrder", () => {
  const prevPrefix = process.env.PAYTR_OID_PREFIX
  const prevDry = process.env.BIZIMHESAP_DRY_RUN

  beforeEach(() => {
    delete process.env.PAYTR_OID_PREFIX
    delete process.env.BIZIMHESAP_DRY_RUN
    jest.clearAllMocks()
  })

  afterAll(() => {
    globalThis.fetch = realFetch
    if (prevPrefix !== undefined) process.env.PAYTR_OID_PREFIX = prevPrefix
    if (prevDry !== undefined) process.env.BIZIMHESAP_DRY_RUN = prevDry
  })

  it("başarı: tek istek, pending önce yazılır, ikinci çağrı istek atmaz", async () => {
    const order = baseOrder()
    const { scope } = makeScope(order)
    let statusAtFetch: unknown
    const fetchMock = mockFetch(() => {
      statusAtFetch = invoiceOf(order)?.status
      return okResponse()
    })

    const first = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(first.ok).toBe(true)
    expect(statusAtFetch).toBe("pending")
    expect(invoiceOf(order)).toMatchObject({
      status: "created",
      mode: "live",
      guid: "G1",
      invoice_no: "100001",
      total: 184.9,
    })

    const second = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(second.skipped).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(notifyBizimhesapInvoiceProblem).not.toHaveBeenCalled()
  })

  it("gövde sipariş verisini taşır: SKU, kargo satırı, adres, açıklama", async () => {
    const order = baseOrder()
    const { scope } = makeScope(order)
    let sent: Record<string, never> = {}
    globalThis.fetch = jest.fn(async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body)
      return okResponse()
    }) as never

    await issueSalesInvoiceForOrder(scope, "order_1")

    expect(sent.firmId).toBe("GERCEK")
    expect(sent.invoiceNo).toBe("100001")
    expect(sent.invoiceType).toBe(3)
    expect(sent.customer).toMatchObject({
      customerId: "cus_1",
      title: "Ayşe Yılmaz",
      address: "Yeni Mah. 1, Adapazarı, Sakarya",
      email: "ayse@example.com",
    })
    const details = sent.details as unknown as { productId: string; total: string }[]
    expect(details.map((d) => [d.productId, d.total])).toEqual([
      ["ESC-PAPATYA-BP", "35.00"],
      ["KARGO", "149.90"],
    ])
    expect(sent.note).toContain("100001")
    expect(sent.note).toContain("PayTR")
  })

  it("zaman aşımı: unknown, uyarı gider, onaysız tekrar GÖNDERİLMEZ", async () => {
    const order = baseOrder()
    const { scope } = makeScope(order)
    const fetchMock = mockFetch(() => Promise.reject(new Error("timeout")))

    const res = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(res.ok).toBe(false)
    expect(invoiceOf(order).status).toBe("unknown")
    expect(notifyBizimhesapInvoiceProblem).toHaveBeenCalledTimes(1)
    expect(recordOpsEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "invoice.failed", level: "error" })
    )

    const again = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(again.skipped).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const okFetch = mockFetch(okResponse)
    const confirmed = await issueSalesInvoiceForOrder(scope, "order_1", {
      confirmedNotInBizimhesap: true,
    })
    expect(confirmed.ok).toBe(true)
    expect(okFetch).toHaveBeenCalledTimes(1)
    expect(invoiceOf(order).status).toBe("created")
  })

  it("takılı pending onaysız gönderilmez", async () => {
    const order = baseOrder({
      metadata: { bizimhesap_invoice: { status: "pending", mode: "live" } },
    })
    const { scope } = makeScope(order)
    const fetchMock = mockFetch(okResponse)
    const res = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(res.skipped).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("API reddi: error, yeniden denenince gider ve retry sayacı korunur", async () => {
    const order = baseOrder()
    const { scope } = makeScope(order)
    mockFetch(() =>
      Promise.resolve({
        status: 200,
        text: async () => '{"error":"Hatalı para birimi","guid":"","url":""}',
      })
    )
    await issueSalesInvoiceForOrder(scope, "order_1")
    expect(invoiceOf(order)).toMatchObject({
      status: "error",
      error: "Hatalı para birimi",
    })

    order.metadata = {
      bizimhesap_invoice: { ...invoiceOf(order), retry_count: 2 },
    }
    const okFetch = mockFetch(okResponse)
    await issueSalesInvoiceForOrder(scope, "order_1")
    expect(okFetch).toHaveBeenCalledTimes(1)
    expect(invoiceOf(order)).toMatchObject({ status: "created", retry_count: 2 })
  })

  it("toplam siparişle tutmuyorsa hiç gönderilmez", async () => {
    const order = baseOrder({ total: 150 })
    const { scope } = makeScope(order)
    const fetchMock = mockFetch(okResponse)
    const res = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(res.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(invoiceOf(order).status).toBe("error")
    expect(String(invoiceOf(order).error)).toContain("tutmuyor")
  })

  it("indirimli ve adetli sipariş toplamla tutar", async () => {
    const order = baseOrder({
      total: 180,
      shipping_total: 0,
      items: [
        {
          title: "Çay",
          detail: { quantity: 2 },
          unit_price: 100,
          variant_sku: "A",
          discount_total: 20,
          tax_lines: [{ rate: 1 }],
        },
      ],
    })
    const { scope } = makeScope(order)
    mockFetch(okResponse)
    const res = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(res.ok).toBe(true)
    expect(invoiceOf(order).total).toBe(180)
  })

  it("KDV hariç fiyatlı kalemde KDV eklenir, iki kez düşülmez", async () => {
    const order = baseOrder({
      total: 101,
      shipping_total: 0,
      items: [
        {
          title: "Çay",
          detail: { quantity: 1 },
          unit_price: 100,
          is_tax_inclusive: false,
          variant_sku: "A",
          tax_lines: [{ rate: 1 }],
        },
      ],
    })
    const { scope } = makeScope(order)
    mockFetch(okResponse)
    expect((await issueSalesInvoiceForOrder(scope, "order_1")).ok).toBe(true)
  })

  it("canlı dışı işareti: gerçek firmId olsa da istek atılmaz", async () => {
    process.env.PAYTR_OID_PREFIX = "STG"
    const order = baseOrder()
    const { scope } = makeScope(order)
    const fetchMock = mockFetch(okResponse)
    const res = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(res.ok).toBe(true)
    expect(invoiceOf(order)).toMatchObject({ status: "dry_run", total: 184.9 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("firmId yoksa mock kayıt, HTTP yok", async () => {
    const order = baseOrder()
    const { scope } = makeScope(order, "")
    const fetchMock = mockFetch(okResponse)
    await issueSalesInvoiceForOrder(scope, "order_1")
    expect(invoiceOf(order)).toMatchObject({
      status: "created",
      mode: "mock",
      guid: "mock-100001",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("iptal sipariş gönderilmez; mevcut metadata korunur", async () => {
    const order = baseOrder({ status: "canceled", metadata: { contract: "x" } })
    const { scope } = makeScope(order)
    const fetchMock = mockFetch(okResponse)
    const res = await issueSalesInvoiceForOrder(scope, "order_1")
    expect(res.skipped).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(order.metadata?.contract).toBe("x")
  })
})

describe("buildInvoiceNote", () => {
  const prev = process.env.BIZIMHESAP_INTERNET_SALE_URL

  afterAll(() => {
    if (prev === undefined) delete process.env.BIZIMHESAP_INTERNET_SALE_URL
    else process.env.BIZIMHESAP_INTERNET_SALE_URL = prev
  })

  it("internet satışı bilgisini açıklamaya yazar", () => {
    process.env.BIZIMHESAP_INTERNET_SALE_URL = "https://market.esteacay.com/"
    expect(buildInvoiceNote("100001", { date: "2026-11-03" })).toBe(
      "Es Çay sipariş 100001. İnternet satışı: https://market.esteacay.com. Ödeme: KREDIKARTI/BANKAKARTI (PayTR), 2026-11-03."
    )
    expect(buildInvoiceNote("100001", { bankTransfer: true })).toContain("EFT/HAVALE")
  })
})

describe("flagRefundInvoiceForReturn", () => {
  beforeEach(() => jest.clearAllMocks())
  const input = { return_id: "ret_1", order_id: "order_1", amount: 35 }

  it("elle kesilecek işareti + olay + mail; ikinci çağrı tekrar uyarmaz", async () => {
    const order = baseOrder({ metadata: { bizimhesap_invoice: { guid: "G1" } } })
    const { scope } = makeScope(order)

    const res = await flagRefundInvoiceForReturn(scope, input)
    expect(res.meta).toMatchObject({
      status: "manual_required",
      amount: 35,
      sales_guid: "G1",
    })
    expect(order.metadata?.bizimhesap_invoice).toEqual({ guid: "G1" })
    expect(notifyManualRefundInvoice).toHaveBeenCalledTimes(1)
    expect(recordOpsEvent).toHaveBeenCalledTimes(1)

    const again = await flagRefundInvoiceForReturn(scope, input)
    expect(again.skipped).toBe(true)
    expect(notifyManualRefundInvoice).toHaveBeenCalledTimes(1)
  })

  it("reddedilen iade: işlem yok", async () => {
    const order = baseOrder()
    const { scope } = makeScope(order, "GERCEK", {
      escay_rejection: { rejected: true },
    })
    const res = await flagRefundInvoiceForReturn(scope, input)
    expect(res.skipped).toBe(true)
    expect(res.meta.note).toBe("escay_rejection")
    expect(notifyManualRefundInvoice).not.toHaveBeenCalled()
    expect(order.metadata).toBeNull()
  })
})
