import {
  assertParasutDryRunEnabled,
  isParasutDryRun,
  normalizeOptions,
  parseDryRunFlag,
  shouldRetryParasutInvoice,
} from "../options"
import { ParasutClient, ParasutError, retryAfterMs } from "../client"

describe("PARASUT_DRY_RUN flags", () => {
  const prev = process.env.PARASUT_DRY_RUN

  afterEach(() => {
    if (prev === undefined) delete process.env.PARASUT_DRY_RUN
    else process.env.PARASUT_DRY_RUN = prev
  })

  it("defaults to false (prod unchanged)", () => {
    delete process.env.PARASUT_DRY_RUN
    expect(parseDryRunFlag(undefined)).toBe(false)
    expect(isParasutDryRun()).toBe(false)
    expect(normalizeOptions({}).dryRun).toBe(false)
  })

  it("parses true/1/yes", () => {
    expect(parseDryRunFlag("true")).toBe(true)
    expect(parseDryRunFlag("1")).toBe(true)
    expect(parseDryRunFlag("yes")).toBe(true)
    expect(parseDryRunFlag("false")).toBe(false)
  })

  it("assertParasutDryRunEnabled rejects when false", () => {
    delete process.env.PARASUT_DRY_RUN
    expect(() => assertParasutDryRunEnabled()).toThrow(/REDDEDİLDİ/)
    expect(() => assertParasutDryRunEnabled()).toThrow(/PARASUT_DRY_RUN=true/)
  })

  it("assertParasutDryRunEnabled allows when true", () => {
    process.env.PARASUT_DRY_RUN = "true"
    expect(() => assertParasutDryRunEnabled()).not.toThrow()
  })
})

describe("shouldRetryParasutInvoice — draft_dryrun excluded", () => {
  it("retries only error/pending", () => {
    expect(shouldRetryParasutInvoice("error")).toBe(true)
    expect(shouldRetryParasutInvoice("pending")).toBe(true)
    expect(shouldRetryParasutInvoice("draft_dryrun")).toBe(false)
    expect(shouldRetryParasutInvoice("issued")).toBe(false)
    expect(shouldRetryParasutInvoice("skipped")).toBe(false)
  })
})

describe("finalizeInvoice / refund DRY-RUN guard", () => {
  const prev = process.env.PARASUT_DRY_RUN

  afterEach(() => {
    if (prev === undefined) delete process.env.PARASUT_DRY_RUN
    else process.env.PARASUT_DRY_RUN = prev
  })

  function liveClient(dryRun: boolean) {
    let httpCalls = 0
    const client = new ParasutClient({
      ...normalizeOptions({
        clientId: "cid",
        clientSecret: "secret",
        username: "user@test",
        password: "pass",
        companyId: "811925",
        dryRun,
      }),
      transport: async () => {
        httpCalls += 1
        return { ok: true, status: 200, text: async () => "{}" }
      },
    })
    return { client, getHttpCalls: () => httpCalls }
  }

  it("finalizeInvoice throws and makes zero HTTP when dryRun", async () => {
    delete process.env.PARASUT_DRY_RUN
    const { client, getHttpCalls } = liveClient(true)
    await expect(
      client.finalizeInvoice({ invoiceId: "inv-1", orderId: "ord-1" })
    ).rejects.toBeInstanceOf(ParasutError)
    await expect(
      client.finalizeInvoice({ invoiceId: "inv-1" })
    ).rejects.toThrow(/DRY-RUN/)
    expect(client.finalizeInvoiceCalls).toBe(0)
    expect(getHttpCalls()).toBe(0)
  })

  it("createRefundInvoice throws and makes zero HTTP when dryRun", async () => {
    delete process.env.PARASUT_DRY_RUN
    const { client, getHttpCalls } = liveClient(true)
    await expect(
      client.createRefundInvoice({
        originalInvoiceId: "inv-1",
        orderId: "o",
        returnId: "ret-1",
        amount: 10,
      })
    ).rejects.toThrow(/DRY-RUN/)
    expect(client.createRefundInvoiceCalls).toBe(0)
    expect(getHttpCalls()).toBe(0)
  })

  it("env PARASUT_DRY_RUN=true blocks even if options.dryRun false", async () => {
    process.env.PARASUT_DRY_RUN = "true"
    const { client, getHttpCalls } = liveClient(false)
    await expect(
      client.finalizeInvoice({ invoiceId: "inv-env" })
    ).rejects.toThrow(/DRY-RUN/)
    expect(getHttpCalls()).toBe(0)
  })
})

describe("retryAfterMs", () => {
  it("reads 'Try again in N seconds' from 429 body", () => {
    const err = new ParasutError("429", {
      status: 429,
      responseBody: { errors: [{ title: "Too many requests", detail: "Try again in 8 seconds." }] },
    })
    expect(retryAfterMs(err)).toBe(8250)
    expect(retryAfterMs(new ParasutError("500", { status: 500 }))).toBeNull()
  })
})

describe("Parasut HTTP error body logging", () => {
  it("logs and attaches 422 JSON errors (errors[].detail/source)", async () => {
    const logs: string[] = []
    const errorBody = {
      errors: [
        {
          title: "unprocessable_entity",
          detail: "Vat rate is invalid",
          source: {
            pointer: "/data/relationships/details/data/0/attributes/vat_rate",
          },
        },
      ],
    }
    const client = new ParasutClient({
      ...normalizeOptions({
        clientId: "cid",
        clientSecret: "secret",
        username: "user@test",
        password: "pass",
        companyId: "811925",
        dryRun: true,
      }),
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: (m) => logs.push(m),
      },
      transport: async (url) => {
        if (url.includes("/oauth")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({ access_token: "tok", expires_in: 7200 }),
          }
        }
        return {
          ok: false,
          status: 422,
          text: async () => JSON.stringify(errorBody),
        }
      },
    })

    try {
      await client.createSalesInvoice({
        contactId: "c1",
        orderId: "order_1",
        lines: [{ description: "x", quantity: 1, unitPrice: 10, vatRate: 10 }],
      })
      throw new Error("expected ParasutError")
    } catch (err) {
      expect(err).toBeInstanceOf(ParasutError)
      const pe = err as ParasutError
      expect(pe.status).toBe(422)
      expect(pe.responseBody).toEqual(errorBody)
      expect(pe.message).toContain("422")
      expect(pe.message).toContain("Vat rate is invalid")
      expect(pe.message).toContain("vat_rate")
    }

    expect(logs.some((l) => l.includes("Vat rate is invalid"))).toBe(true)
    expect(logs.some((l) => l.includes("body="))).toBe(true)
  })
})
