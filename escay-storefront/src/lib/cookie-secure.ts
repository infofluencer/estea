/**
 * Cookie Secure flag — production is usually HTTPS, but staging may be plain HTTP.
 * Override with COOKIE_SECURE=true|false when needed.
 */
export function cookieSecureFlag(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (override === "0" || override === "false" || override === "off") {
    return false
  }
  if (override === "1" || override === "true" || override === "on") {
    return true
  }
  for (const key of [
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "STOREFRONT_URL",
    "MEDUSA_STOREFRONT_URL",
  ]) {
    const v = process.env[key]?.trim()
    if (v?.startsWith("https://")) return true
    if (v?.startsWith("http://")) return false
  }
  return process.env.NODE_ENV === "production"
}
