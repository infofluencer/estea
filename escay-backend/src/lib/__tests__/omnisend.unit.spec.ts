import {
  abandonedCheckoutUrl,
  deterministicEventId,
  omnisendSkipReason,
  toOmnisendLineItems,
} from "../omnisend"

describe("omnisendSkipReason", () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it("is disabled without an API key", () => {
    delete process.env.OMNISEND_API_KEY
    expect(omnisendSkipReason("a@b.com")).toMatch(/API_KEY/)
  })

  it("sends everything in prod (no PAYTR_OID_PREFIX)", () => {
    process.env.OMNISEND_API_KEY = "k"
    delete process.env.PAYTR_OID_PREFIX
    delete process.env.OMNISEND_TEST_EMAILS
    expect(omnisendSkipReason("anyone@example.com")).toBeNull()
  })

  it("blocks everyone on staging when the allowlist is empty", () => {
    process.env.OMNISEND_API_KEY = "k"
    process.env.PAYTR_OID_PREFIX = "STG"
    delete process.env.OMNISEND_TEST_EMAILS
    expect(omnisendSkipReason("e2e-1@escay.test")).toMatch(/non-prod/)
  })

  it("allows only allowlisted emails on staging (case-insensitive)", () => {
    process.env.OMNISEND_API_KEY = "k"
    process.env.PAYTR_OID_PREFIX = "STG"
    process.env.OMNISEND_TEST_EMAILS = "Me@Example.com, other@x.com"
    expect(omnisendSkipReason("me@example.com")).toBeNull()
    expect(omnisendSkipReason("e2e-1@escay.test")).toMatch(/non-prod/)
  })
})

describe("omnisend payload helpers", () => {
  it("builds a stable UUID-shaped event id", () => {
    const a = deterministicEventId("placed-order:order_1")
    expect(a).toBe(deterministicEventId("placed-order:order_1"))
    expect(a).not.toBe(deterministicEventId("placed-order:order_2"))
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("maps Medusa line items to Omnisend lineItems", () => {
    process.env.STOREFRONT_URL = "https://market.esteacay.com/"
    const [item] = toOmnisendLineItems([
      {
        product_id: "prod_1",
        variant_id: "variant_1",
        product_title: "Boho Şal",
        variant_title: "Mavi",
        variant_sku: "MK2606",
        product_handle: "boho-sal",
        thumbnail: "https://cdn/x.jpg",
        unit_price: 1299.9,
        quantity: 2,
      },
    ])
    expect(item).toMatchObject({
      productID: "prod_1",
      productVariantID: "variant_1",
      productTitle: "Boho Şal",
      productPrice: 1299.9,
      productQuantity: 2,
      productSKU: "MK2606",
      productURL: "https://market.esteacay.com/products/boho-sal",
    })
    expect(abandonedCheckoutUrl("cart_1")).toBe(
      "https://market.esteacay.com/sepet/recover/cart_1"
    )
  })
})

import { metaCapiSkipReason } from "../meta-capi"

describe("metaCapiSkipReason", () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it("requires token, prod, and marketing cookie consent", () => {
    delete process.env.META_CAPI_TOKEN
    expect(metaCapiSkipReason({ metadata: { tracking_consent: true } })).toMatch(/TOKEN/)
    process.env.META_CAPI_TOKEN = "t"
    process.env.META_PIXEL_ID = "p"
    process.env.PAYTR_OID_PREFIX = "STG"
    expect(metaCapiSkipReason({ metadata: { tracking_consent: true } })).toMatch(/non-prod/)
    delete process.env.PAYTR_OID_PREFIX
    expect(metaCapiSkipReason({ metadata: {} })).toMatch(/consent/)
    expect(metaCapiSkipReason({ metadata: { tracking_consent: true } })).toBeNull()
  })
})
