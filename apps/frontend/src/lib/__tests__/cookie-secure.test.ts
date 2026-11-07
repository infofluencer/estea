import { beforeEach, describe, expect, it, vi } from "vitest"
import { cookieSecureFlag } from "../cookie-secure"

const URL_KEYS = ["NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_SITE_URL", "STOREFRONT_URL", "MEDUSA_STOREFRONT_URL"]

beforeEach(() => {
  vi.stubEnv("COOKIE_SECURE", undefined)
  for (const k of URL_KEYS) vi.stubEnv(k, undefined)
  vi.stubEnv("NODE_ENV", "test")
})

describe("cookieSecureFlag", () => {
  it.each(["0", "false", "OFF", " False "])("COOKIE_SECURE=%j → false (https olsa da)", (v) => {
    vi.stubEnv("COOKIE_SECURE", v)
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://market.esteacay.com")
    expect(cookieSecureFlag()).toBe(false)
  })

  it.each(["1", "true", "ON"])("COOKIE_SECURE=%j → true (http olsa da)", (v) => {
    vi.stubEnv("COOKIE_SECURE", v)
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://10.0.0.5:3025")
    expect(cookieSecureFlag()).toBe(true)
  })

  it("geçersiz override yok sayılır, URL'ye bakılır", () => {
    vi.stubEnv("COOKIE_SECURE", "yes")
    vi.stubEnv("STOREFRONT_URL", "https://x.com")
    expect(cookieSecureFlag()).toBe(true)
  })

  it("ilk tanımlı URL anahtarı kazanır", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://staging.local")
    vi.stubEnv("STOREFRONT_URL", "https://market.esteacay.com")
    expect(cookieSecureFlag()).toBe(false)
  })

  it("protokolsüz URL atlanır", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "market.esteacay.com")
    vi.stubEnv("MEDUSA_STOREFRONT_URL", " https://market.esteacay.com ")
    expect(cookieSecureFlag()).toBe(true)
  })

  it("hiçbir şey yoksa NODE_ENV=production'a bakar", () => {
    expect(cookieSecureFlag()).toBe(false)
    vi.stubEnv("NODE_ENV", "production")
    expect(cookieSecureFlag()).toBe(true)
  })
})
