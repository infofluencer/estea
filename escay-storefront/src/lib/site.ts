/**
 * Public site origin (canonical, sitemap, feed linkleri). Sunucu tarafında
 * runtime okunur — domain değişince rebuild gerekmez.
 * Dokploy frontend Environment: SITE_URL=https://market.esteacay.com
 *
 * TODO(K8): nihai domain kararı (market.esteacay.com varsayımı).
 */

/** Canonical host (www'suz). Build anında gömülür (next.config.ts de okur). */
export const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_HOST || "market.esteacay.com")
  .trim()
  .replace(/^www\./, "")

export function siteUrl(): string {
  return (process.env.SITE_URL || `https://${SITE_HOST}`).replace(/\/$/, "")
}

/** Yalnızca gerçek domain indekslenir; staging / IP erişimi noindex. */
export function isIndexableSite(): boolean {
  try {
    const host = new URL(siteUrl()).hostname
    return host === SITE_HOST || host === `www.${SITE_HOST}`
  } catch {
    return false
  }
}

/** Tarayıcı tarafı: canlı domain mi (takip script'leri yalnız burada yüklenir). */
export function isProductionHostname(hostname: string): boolean {
  return hostname === SITE_HOST || hostname === `www.${SITE_HOST}`
}
