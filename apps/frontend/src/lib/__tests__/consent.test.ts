import { afterEach, describe, expect, it, vi } from "vitest"

type Listener = () => void

function stubBrowser(opts: {
  cookie?: string
  getCkyConsent?: () => { categories: Record<string, boolean>; isUserActionCompleted: boolean }
}) {
  const listeners = new Map<string, Set<Listener>>()
  vi.stubGlobal("window", { getCkyConsent: opts.getCkyConsent })
  vi.stubGlobal("document", {
    cookie: opts.cookie ?? "",
    addEventListener: (t: string, h: Listener) => {
      if (!listeners.has(t)) listeners.set(t, new Set())
      listeners.get(t)!.add(h)
    },
    removeEventListener: (t: string, h: Listener) => listeners.get(t)?.delete(h),
  })
  return {
    fire: (t: string) => listeners.get(t)?.forEach((h) => h()),
    count: (t: string) => listeners.get(t)?.size ?? 0,
  }
}

const load = async () => {
  vi.resetModules()
  return import("../consent")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("COOKIEYES_SITE_ID", () => {
  it("env yoksa / boşluksa boş string", async () => {
    vi.stubEnv("NEXT_PUBLIC_COOKIEYES_ID", "   ")
    expect((await load()).COOKIEYES_SITE_ID).toBe("")
    vi.stubEnv("NEXT_PUBLIC_COOKIEYES_ID", " abc123 ")
    expect((await load()).COOKIEYES_SITE_ID).toBe("abc123")
  })
})

describe("readConsent", () => {
  it("CookieYes API: seçim yapılmadıysa null", async () => {
    stubBrowser({
      getCkyConsent: () => ({ categories: { analytics: true }, isUserActionCompleted: false }),
    })
    expect((await load()).readConsent()).toBeNull()
  })

  it("CookieYes API: performance → analytics, advertisement → marketing", async () => {
    stubBrowser({
      getCkyConsent: () => ({
        categories: { analytics: false, performance: true, advertisement: false },
        isUserActionCompleted: true,
      }),
    })
    expect((await load()).readConsent()).toEqual({ analytics: true, marketing: false })
  })

  it("API yoksa çerezden okur", async () => {
    stubBrowser({
      cookie:
        "_ga=GA1; cookieyes-consent=" +
        encodeURIComponent("consentid:abc,consent:yes,action:yes,necessary:yes,analytics:no,performance:no,advertisement:yes") +
        "; other=1",
    })
    expect((await load()).readConsent()).toEqual({ analytics: false, marketing: true })
  })

  it("çerezde action:yes yoksa null", async () => {
    stubBrowser({ cookie: "cookieyes-consent=consentid:abc,consent:no,action:no,analytics:yes" })
    expect((await load()).readConsent()).toBeNull()
  })

  it("çerez yoksa null", async () => {
    stubBrowser({ cookie: "_ga=GA1" })
    expect((await load()).readConsent()).toBeNull()
  })

  it("API hata atarsa null", async () => {
    stubBrowser({
      getCkyConsent: () => {
        throw new Error("cky yüklenmedi")
      },
    })
    expect((await load()).readConsent()).toBeNull()
  })

  it("window yoksa (SSR) null", async () => {
    const m = await load()
    expect(m.readConsent()).toBeNull()
  })
})

describe("onConsentChange", () => {
  it("güncelleme olayında güncel onayı iletir, abonelik iptal edilebilir", async () => {
    let completed = false
    const browser = stubBrowser({
      getCkyConsent: () => ({ categories: { analytics: true, advertisement: true }, isUserActionCompleted: completed }),
    })
    const m = await load()
    const cb = vi.fn()
    const off = m.onConsentChange(cb)
    browser.fire("cookieyes_consent_update")
    completed = true
    browser.fire("cookieyes_consent_update")
    expect(cb.mock.calls).toEqual([[null], [{ analytics: true, marketing: true }]])
    off()
    expect(browser.count("cookieyes_consent_update")).toBe(0)
  })
})
