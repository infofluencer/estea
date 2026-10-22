import type { NextConfig } from "next"

/**
 * Canonical host (www'suz). Build anında gömülür; lib/site.ts ile aynı varsayılan.
 * TODO(K8): nihai domain kararı.
 */
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_HOST || "market.esteacay.com")
  .trim()
  .replace(/^www\./, "")

// Temel güvenlik başlıkları. CSP bilerek yok: GA4 / Ads / Pixel / Clarity /
// CookieYes / Omnisend / PayTR iframe'i için izin listesi ayrıca test edilmeli.
// HSTS yalnızca HTTPS'te etkilidir (Traefik TLS); IP üzerinden HTTP'de yok sayılır.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // PayTR iframe'i ödeme sonunda /odeme/payment-result'ı çerçeve İÇİNDE açar;
  // müşteri www'dayken dönüş apex'e giderse SAMEORIGIN bunu engellerdi.
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors 'self' https://${SITE_HOST} https://www.${SITE_HOST}`,
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    externalDir: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  // Önceki İngilizce yollar → Türkçe (mail/PayTR/Omnisend linkleri, eski deploy'lar).
  async redirects() {
    const legacy = [
      ["/about", "/hakkimizda"],
      ["/contact", "/iletisim"],
      ["/favorites", "/istek-listesi"],
      ["/legal/gizlilik-kvkk", "/gizlilik-politikasi"],
      ["/legal/cerez-politikasi", "/cerez-politikasi"],
      ["/legal/iade-ve-cayma", "/iade-ve-geri-odeme-politikasi"],
      ["/cart/:path*", "/sepet/:path*"],
      ["/checkout/:path*", "/odeme/:path*"],
      ["/account/:path*", "/hesabim/:path*"],
    ].map(([source, destination]) => ({ source, destination, permanent: true }))
    // Tek host: www → apex (PayTR dönüşü, çerezler, SEO kopya içerik).
    const canonicalHost = {
      source: "/:path*",
      has: [{ type: "host" as const, value: `www.${SITE_HOST}` }],
      destination: `https://${SITE_HOST}/:path*`,
      permanent: true,
    }
    return [canonicalHost, ...legacy]
  },
}

export default nextConfig
