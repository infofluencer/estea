import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  vi.resetModules()
})

describe("auth/constants", () => {
  it("çerez adları ve süreleri", async () => {
    const c = await import("../auth/constants")
    expect(c.AUTH_COOKIE).toBe("_escay_jwt")
    expect(c.VERIFY_COOKIE).toBe("_escay_verify_jwt")
    expect(c.AUTH_COOKIE_MAX_AGE).toBe(604_800)
    expect(c.VERIFY_COOKIE_MAX_AGE).toBe(86_400)
    expect(c.LAST_ORDER_COOKIE_MAX_AGE).toBe(86_400)
    for (const opts of [c.AUTH_COOKIE_OPTIONS, c.VERIFY_COOKIE_OPTIONS, c.LAST_ORDER_COOKIE_OPTIONS]) {
      expect(opts).toMatchObject({ path: "/", sameSite: "lax", httpOnly: true })
    }
    expect(c.AUTH_COOKIE_OPTIONS.maxAge).toBe(c.AUTH_COOKIE_MAX_AGE)
  })

  it("secure bayrağı modül yüklenirken env'den okunur", async () => {
    vi.stubEnv("COOKIE_SECURE", "true")
    const secure = await import("../auth/constants")
    expect(secure.AUTH_COOKIE_OPTIONS.secure).toBe(true)
    vi.resetModules()
    vi.stubEnv("COOKIE_SECURE", "false")
    const plain = await import("../auth/constants")
    expect(plain.AUTH_COOKIE_OPTIONS.secure).toBe(false)
    expect(plain.LAST_ORDER_COOKIE_OPTIONS.secure).toBe(false)
  })

  it("şifre politikası mesajı", async () => {
    const c = await import("../auth/constants")
    expect(c.AUTH_PASSWORD_MIN_LENGTH).toBe(8)
    expect(c.authPasswordTooShortMessage()).toBe("Şifre en az 8 karakter olmalıdır.")
    expect(c.authPasswordTooShortMessage(12)).toBe("Şifre en az 12 karakter olmalıdır.")
  })

  it("üyelik onayı kaydı sürüm, zaman ve 18 yaş beyanını taşır", async () => {
    const c = await import("../auth/constants")
    const at = new Date("2026-11-11T09:30:00.000Z")
    expect(c.membershipConsentMetadata("2026-11-11-draft", at)).toEqual({
      membership_terms_version: "2026-11-11-draft",
      membership_terms_accepted_at: "2026-11-11T09:30:00.000Z",
      age_18_confirmed: true,
    })
    expect(c.MEMBERSHIP_TERMS_REQUIRED_MESSAGE).toMatch(/18 yaş/)
  })
})

describe("pending-checkout seçenekleri", () => {
  it("son sipariş çerezi seçenekleriyle aynı (24 saat, httpOnly)", async () => {
    vi.doMock("next/headers", () => ({ cookies: vi.fn() }))
    const p = await import("../pending-checkout")
    expect(p.PENDING_CHECKOUT_COOKIE).toBe("_escay_pending_checkout")
    expect(p.PENDING_CHECKOUT_COOKIE_OPTIONS).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 86_400,
    })
    vi.doUnmock("next/headers")
  })
})
