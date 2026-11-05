import { isBizimhesapDryRun, normalizeOptions, shouldRetryBizimhesapInvoice } from "../options"
import { buildAddInvoicePayload } from "../payload"
import BizimhesapModuleService, {
  BizimhesapError,
  parseAddInvoiceResponse,
} from "../service"

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never

const { payload } = buildAddInvoicePayload({
  firmId: "GERCEK",
  invoiceNo: "100001",
  customer: { customerId: "c", title: "T" },
  lines: [{ productId: "A", productName: "A", vatRate: 1, quantity: 1, grossUnitPrice: 10 }],
})

function rejectedFlag(fn: () => unknown): boolean | undefined {
  try {
    fn()
  } catch (err) {
    return err instanceof BizimhesapError ? err.rejected : undefined
  }
  return undefined
}

describe("parseAddInvoiceResponse", () => {
  it("başarı: guid + url", () => {
    expect(
      parseAddInvoiceResponse(200, '{"error":"","guid":"AB1","url":"https://x"}')
    ).toEqual({ guid: "AB1", url: "https://x" })
  })

  it("API hatası ve 4xx: reddedildi, yeniden denenebilir", () => {
    expect(
      rejectedFlag(() =>
        parseAddInvoiceResponse(200, '{"error":"Hatalı para birimi","guid":"","url":""}')
      )
    ).toBe(true)
    expect(rejectedFlag(() => parseAddInvoiceResponse(401, "yetkisiz"))).toBe(true)
  })

  it("5xx, okunamayan ve guid'siz yanıt: sonuç belirsiz, kayıt oluşmuş olabilir", () => {
    expect(rejectedFlag(() => parseAddInvoiceResponse(502, "bad gateway"))).toBe(false)
    expect(rejectedFlag(() => parseAddInvoiceResponse(200, "<html>"))).toBe(false)
    expect(rejectedFlag(() => parseAddInvoiceResponse(200, '{"error":"","guid":""}'))).toBe(false)
  })
})

describe("BizimhesapModuleService.addInvoice", () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it("firmId yoksa HTTP atmaz", async () => {
    const fetchMock = jest.fn()
    globalThis.fetch = fetchMock as never
    const svc = new BizimhesapModuleService({ logger }, {})
    const res = await svc.addInvoice(payload)
    expect(res).toEqual({ guid: "mock-100001", mock: true })
    expect(svc.getConnectionStatus().mode).toBe("mock")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("dokümandaki örnek firmId canlı sayılmaz", () => {
    const svc = new BizimhesapModuleService(
      { logger },
      { firmId: "485E152158494BE590B5F72403398765" }
    )
    expect(svc.getConnectionStatus().mode).toBe("mock")
  })

  it("tek istek atar, zaman aşımını belirsiz sayar", async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error("timeout"))
    globalThis.fetch = fetchMock as never
    const svc = new BizimhesapModuleService({ logger }, { firmId: "GERCEK" })
    await expect(svc.addInvoice(payload)).rejects.toMatchObject({ rejected: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://bizimhesap.com/api/b2b/addinvoice")
  })
})

describe("options", () => {
  const prevPrefix = process.env.PAYTR_OID_PREFIX
  const prevDry = process.env.BIZIMHESAP_DRY_RUN

  afterEach(() => {
    process.env.PAYTR_OID_PREFIX = prevPrefix
    process.env.BIZIMHESAP_DRY_RUN = prevDry
    if (prevPrefix === undefined) delete process.env.PAYTR_OID_PREFIX
    if (prevDry === undefined) delete process.env.BIZIMHESAP_DRY_RUN
  })

  it("PAYTR_OID_PREFIX doluyken dry-run zorlanır", () => {
    process.env.PAYTR_OID_PREFIX = "STG"
    process.env.BIZIMHESAP_DRY_RUN = "false"
    expect(isBizimhesapDryRun()).toBe(true)
    expect(normalizeOptions({ firmId: "F", dryRun: "false" }).dryRun).toBe(true)
  })

  it("kargo KDV varsayılanı 20, 0 ayarlanabilir", () => {
    delete process.env.PAYTR_OID_PREFIX
    expect(normalizeOptions({}).shippingVatRate).toBe(20)
    expect(normalizeOptions({ shippingVatRate: "0" }).shippingVatRate).toBe(0)
  })

  it("yalnız error yeniden denenir; belirsiz kayıt denenmez", () => {
    expect(shouldRetryBizimhesapInvoice("error")).toBe(true)
    for (const s of ["pending", "unknown", "created", "dry_run", "skipped", null]) {
      expect(shouldRetryBizimhesapInvoice(s)).toBe(false)
    }
  })
})
