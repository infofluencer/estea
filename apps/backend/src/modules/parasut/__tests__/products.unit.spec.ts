import { ParasutClient, ParasutError } from "../client"
import { normalizeOptions, toParasutCurrency } from "../options"
import { buildSalesInvoicePayload } from "../payload"

type Call = { method: string; url: string; body?: unknown }

function liveClient(opts: {
  products: { id: string; code?: string; name?: string }[]
  dryRun?: boolean
  productCreate?: string
  shippingProductId?: string
}) {
  const calls: Call[] = []
  const client = new ParasutClient({
    ...normalizeOptions({
      clientId: "cid",
      clientSecret: "secret",
      username: "user@test",
      password: "pass",
      companyId: "811925",
      dryRun: opts.dryRun ?? true,
      productCreate: opts.productCreate,
      shippingProductId: opts.shippingProductId,
    }),
    transport: async (url, init) => {
      if (url.includes("/oauth/token")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ access_token: "tok", expires_in: 7200 }),
        }
      }
      calls.push({
        method: init.method,
        url,
        body: init.body ? JSON.parse(init.body) : undefined,
      })
      if (init.method === "GET" && url.includes("/products?")) {
        // Parasut filter "contains" gibi davranabilir — mock da öyle
        const params = new URL(url).searchParams
        const qCode = params.get("filter[code]")
        const qName = params.get("filter[name]")
        const data = opts.products
          .filter(
            (p) =>
              (qCode != null && p.code?.includes(qCode)) ||
              (qName != null && p.name?.includes(qName))
          )
          .map((p) => ({ id: p.id, attributes: { code: p.code, name: p.name } }))
        return { ok: true, status: 200, text: async () => JSON.stringify({ data }) }
      }
      if (init.method === "POST" && url.endsWith("/products")) {
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ data: { id: "new-prod" } }),
        }
      }
      if (init.method === "POST" && url.endsWith("/sales_invoices")) {
        return {
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ data: { id: "inv-1" } }),
        }
      }
      return { ok: false, status: 404, text: async () => "{}" }
    },
  })
  return { client, calls }
}

const invoiceInput = {
  contactId: "c1",
  orderId: "order_1",
  currencyCode: "try",
  lines: [
    {
      description: "Siyah Çay",
      quantity: 1,
      unitPrice: 500,
      vatRate: 10,
      productCode: "SKU-1",
    },
  ],
  shipping: { description: "Kargo", amount: 124.99, vatRate: 20 },
}

describe("toParasutCurrency", () => {
  it("maps TRY/try/TL to TRL (Parasut enum)", () => {
    expect(toParasutCurrency("TRY")).toBe("TRL")
    expect(toParasutCurrency("try")).toBe("TRL")
    expect(toParasutCurrency("TL")).toBe("TRL")
    expect(toParasutCurrency(undefined)).toBe("TRL")
    expect(toParasutCurrency("usd")).toBe("USD")
  })
})

describe("productCreate default", () => {
  it("off in dry-run, on in live, env override wins", () => {
    const base = {
      clientId: "a",
      clientSecret: "b",
      username: "c",
      password: "d",
      companyId: "1",
    }
    const prev = process.env.PARASUT_DRY_RUN
    delete process.env.PARASUT_DRY_RUN
    expect(normalizeOptions({ ...base, dryRun: true }).productCreate).toBe(false)
    expect(normalizeOptions({ ...base, dryRun: false }).productCreate).toBe(true)
    expect(
      normalizeOptions({ ...base, dryRun: true, productCreate: "true" })
        .productCreate
    ).toBe(true)
    if (prev !== undefined) process.env.PARASUT_DRY_RUN = prev
  })
})

describe("payload product relationship", () => {
  it("adds relationships.product when productId set", () => {
    const body = buildSalesInvoicePayload({
      ...invoiceInput,
      lines: [{ ...invoiceInput.lines[0], productId: "p-1" }],
      shipping: { ...invoiceInput.shipping, productId: "p-ship" },
    })
    const d = body.data.relationships.details.data
    expect(d[0].relationships?.product.data).toEqual({ type: "products", id: "p-1" })
    expect(d[1].relationships?.product.data).toEqual({ type: "products", id: "p-ship" })
    expect(body.data.attributes.currency).toBe("TRL")
  })
})

describe("createSalesInvoice attaches Parasut products", () => {
  it("links SKU + KARGO products found by code, posts TRL", async () => {
    const { client, calls } = liveClient({
      products: [
        { id: "p-sku1", code: "SKU-1" },
        { id: "p-kargo", code: "KARGO" },
      ],
    })
    const res = await client.createSalesInvoice(invoiceInput)
    expect(res.invoiceId).toBe("inv-1")
    const post = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/sales_invoices")
    )!
    const body = post.body as ReturnType<typeof buildSalesInvoicePayload>
    const d = body.data.relationships.details.data
    expect(d[0].relationships?.product.data.id).toBe("p-sku1")
    expect(d[1].relationships?.product.data.id).toBe("p-kargo")
    expect(body.data.attributes.currency).toBe("TRL")
    expect(client.createProductCalls).toBe(0)
  })

  it("dry-run + missing product → no product POST, no invoice POST, clear error", async () => {
    const { client, calls } = liveClient({ products: [{ id: "p-sku1", code: "SKU-1" }] })
    await expect(client.createSalesInvoice(invoiceInput)).rejects.toThrow(
      /ürün\/hizmet bulunamadı.*KARGO/
    )
    expect(calls.some((c) => c.method === "POST")).toBe(false)
    expect(client.createProductCalls).toBe(0)
    expect(client.lastSalesInvoiceInput?.lines[0].productId).toBe("p-sku1")
  })

  it("shippingProductId skips lookup for kargo", async () => {
    const { client, calls } = liveClient({
      products: [{ id: "p-sku1", code: "SKU-1" }],
      shippingProductId: "fixed-ship",
    })
    await client.createSalesInvoice(invoiceInput)
    expect(
      calls.filter((c) => c.method === "GET" && c.url.includes("KARGO"))
    ).toHaveLength(0)
    expect(client.lastSalesInvoiceInput?.shipping?.productId).toBe("fixed-ship")
  })

  it("productCreate=true creates missing product with TRL + no stock tracking", async () => {
    const { client, calls } = liveClient({
      products: [{ id: "p-kargo", code: "KARGO" }],
      productCreate: "true",
    })
    await client.createSalesInvoice(invoiceInput)
    const create = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/products")
    )!
    const attrs = (create.body as { data: { attributes: Record<string, unknown> } })
      .data.attributes
    expect(attrs.code).toBe("SKU-1")
    expect(attrs.currency).toBe("TRL")
    expect(attrs.inventory_tracking).toBe(false)
    expect(client.createProductCalls).toBe(1)
  })

  it("rejects partial code matches (filter may be fuzzy)", async () => {
    const { client } = liveClient({
      products: [
        { id: "wrong", code: "SKU-10" },
        { id: "p-kargo", code: "KARGO" },
      ],
    })
    const r = await client.ensureProduct({ code: "SKU-1", name: "x", vatRate: 10 })
    expect(r).toBeNull()
  })

  it("error is non-retryable ParasutError", async () => {
    const { client } = liveClient({ products: [] })
    try {
      await client.createSalesInvoice(invoiceInput)
      throw new Error("expected")
    } catch (err) {
      expect(err).toBeInstanceOf(ParasutError)
      expect((err as ParasutError).retryable).toBe(false)
    }
  })
})
