// Çerez onayı CookieYes'ten (layout.tsx'te yüklenir).
// Kategoriler: analytics + performance → analytics, advertisement → marketing.
// CookieYes yalnızca kayıtlı domain'de çalışır; staging / localhost'ta onay hiç
// oluşmaz → takip script'leri yüklenmez.
// TODO(K7): Es Çay CookieYes hesabı açılınca NEXT_PUBLIC_COOKIEYES_ID set edilir.

/** Boşsa CookieYes yüklenmez (banner yok → takip script'leri de yüklenmez). */
export const COOKIEYES_SITE_ID = process.env.NEXT_PUBLIC_COOKIEYES_ID?.trim() || ""

export type Consent = {
  analytics: boolean
  marketing: boolean
}

type CkyConsent = {
  categories: Record<string, boolean>
  isUserActionCompleted: boolean
}

declare global {
  interface Window {
    getCkyConsent?: () => CkyConsent
    revisitCkyConsent?: () => void
  }
}

function fromCategories(c: Record<string, boolean>): Consent {
  return {
    analytics: Boolean(c.analytics || c.performance),
    marketing: Boolean(c.advertisement),
  }
}

/** `cookieyes-consent=consentid:…,consent:yes,action:yes,analytics:yes,…` */
function readCookie(): Consent | null {
  const raw = document.cookie
    .split("; ")
    .find((p) => p.startsWith("cookieyes-consent="))
    ?.slice("cookieyes-consent=".length)
  if (!raw) return null
  const map: Record<string, string> = {}
  for (const pair of decodeURIComponent(raw).split(",")) {
    const [k, v] = pair.split(":")
    if (k) map[k] = v
  }
  if (map.action !== "yes") return null
  return fromCategories(
    Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v === "yes"]))
  )
}

/** Kullanıcı banner'da seçim yapmadıysa null. */
export function readConsent(): Consent | null {
  try {
    const cky = window.getCkyConsent?.()
    if (cky) return cky.isUserActionCompleted ? fromCategories(cky.categories) : null
    return readCookie()
  } catch {
    return null
  }
}

/** Banner'da kabul / ret / değişiklik olunca çağrılır. */
export function onConsentChange(cb: (consent: Consent | null) => void) {
  const handler = () => cb(readConsent())
  document.addEventListener("cookieyes_consent_update", handler)
  return () => document.removeEventListener("cookieyes_consent_update", handler)
}
