import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.resetModules()
})

const load = () => import("../medusa")

describe("formatTry", () => {
  it("TRY, tr-TR, 2 hane", async () => {
    const { formatTry } = await load()
    expect(formatTry(1234.5)).toBe("₺1.234,50")
    expect(formatTry("249.9")).toBe("₺249,90")
    expect(formatTry(0)).toBe("₺0,00")
    expect(formatTry(0.005)).toBe("₺0,01")
  })

  it.each([null, undefined, "", "abc", Number.NaN, Number.POSITIVE_INFINITY])("%j → boş", async (v) => {
    const { formatTry } = await load()
    expect(formatTry(v as number)).toBe("")
  })
})

describe("variantPriceAmount / variantOriginalAmount", () => {
  it("calculated_amount önce, string sayı kabul", async () => {
    const { variantPriceAmount, variantOriginalAmount } = await load()
    expect(variantPriceAmount({ calculated_amount: "249.9", calculated_amount_with_tax: 300 })).toBe(249.9)
    expect(variantPriceAmount({ calculated_amount: 0 })).toBe(0)
    expect(variantPriceAmount({ calculated_amount: null, calculated_amount_with_tax: 120 })).toBe(120)
    expect(variantPriceAmount({ calculated_amount: "abc", calculated_amount_with_tax: "99.9" })).toBe(99.9)
    expect(variantPriceAmount(null)).toBeNull()
    expect(variantPriceAmount({})).toBeNull()
    expect(variantOriginalAmount({ original_amount: "300" })).toBe(300)
    expect(variantOriginalAmount(undefined)).toBeNull()
  })
})

describe("env tabanlı yardımcılar", () => {
  it("backendUrl / regionId / pricing params", async () => {
    vi.stubEnv("MEDUSA_BACKEND_URL", "")
    vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", "")
    vi.stubEnv("NEXT_PUBLIC_MEDUSA_REGION_ID", "")
    const m = await load()
    expect(m.backendUrl()).toBe("http://localhost:9000")
    expect(m.storePricingParams()).toEqual({ country_code: "tr" })
    expect(m.storeCartCreateParams()).toEqual({})

    vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", "https://api.public")
    vi.stubEnv("MEDUSA_BACKEND_URL", "http://backend:9000")
    vi.stubEnv("NEXT_PUBLIC_MEDUSA_REGION_ID", "reg_tr")
    expect(m.backendUrl()).toBe("http://backend:9000")
    expect(m.storePricingParams()).toEqual({ region_id: "reg_tr", country_code: "tr" })
    expect(m.storeCartCreateParams()).toEqual({ region_id: "reg_tr" })
  })

  it("siteMediaUrl: /media/ öneki ve sorgu atılır, S3 sondaki / kırpılır", async () => {
    vi.stubEnv("NEXT_PUBLIC_S3_FILE_URL", "https://cdn.esteacay.com/")
    const m = await load()
    expect(m.siteMediaUrl("/media/hero/a.jpg?v=2")).toBe("https://cdn.esteacay.com/files/site/hero/a.jpg")
    expect(m.siteMediaUrl("media/b.png")).toBe("https://cdn.esteacay.com/files/site/b.png")
    expect(m.siteMediaUrl(" c.webp ")).toBe("https://cdn.esteacay.com/files/site/c.webp")
  })

  it("S3 yoksa backend /static'e düşer", async () => {
    vi.stubEnv("NEXT_PUBLIC_S3_FILE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL", "http://localhost:9000")
    const m = await load()
    expect(m.s3FileUrl("x.png")).toBe("http://localhost:9000/static/files/x.png")
  })
})
