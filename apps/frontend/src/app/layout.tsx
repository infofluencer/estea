import type { Metadata, Viewport } from "next"
import Script from "next/script"
// Fontlar npm'den (Fontsource): build Google Fonts'a bağlı değil, latin-ext (ş, ğ, ı) dahil.
// Aileler globals.css :root'ta --font-* değişkenleriyle tanımlı.
import "@fontsource-variable/archivo/wght.css"
import "@fontsource-variable/bricolage-grotesque/wght.css"
import { Analytics } from "@/components/Analytics"
import { BackToTop } from "@/components/BackToTop"
import RevealInit from "@/components/brand/RevealInit"
import { FavoritesProvider } from "@/components/FavoritesProvider"
import { OmnisendSnippet } from "@/components/OmnisendSnippet"
import { SiteFooter } from "@/components/SiteFooter"
import { SiteHeader } from "@/components/SiteHeader"
import { getLoggedInCustomer } from "@/lib/auth/customer"
import { COOKIEYES_SITE_ID } from "@/lib/consent"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: {
    default: "Es Çay — Yapraktan bardağa, gerçek çay",
    template: "%s | Es Çay",
  },
  description:
    "Rize ve Artvin'in yüksek bahçelerinden, katkısız harmanlanan Karadeniz çayı. Siyah çay, yeşil çay, bitki çayları ve harmanlar.",
  // Omnisend mağaza doğrulaması
  ...(process.env.NEXT_PUBLIC_OMNISEND_BRAND_ID
    ? {
        other: {
          "omnisend-site-verification":
            process.env.NEXT_PUBLIC_OMNISEND_BRAND_ID,
        },
      }
    : {}),
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const customer = await getLoggedInCustomer()
  const isLoggedIn = Boolean(customer)

  return (
    <html lang="tr" suppressHydrationWarning>
      <body>
        {/* CookieYes — hidrasyondan SONRA yüklenir; NEXT_PUBLIC_COOKIEYES_ID boşsa hiç yüklenmez.
            Senkron <head> kurulumunda banner React hidrasyonundan önce <body>'ye
            eklenip hidrasyon uyuşmazlığına (React #418) yol açıyor, React sayfayı
            yeniden çizince banner siliniyordu → ziyaretçi onay veremiyordu.
            Takip script'leri zaten kendi kodumuzda onaya bağlı (Analytics,
            OmnisendSnippet), CookieYes'in otomatik engellemesine ihtiyaç yok;
            daha önce onay vermiş ziyaretçide onay çerezden okunur. */}
        {COOKIEYES_SITE_ID ? (
          <Script
            id="cookieyes"
            src={`https://cdn-cookieyes.com/client_data/${COOKIEYES_SITE_ID}/script.js`}
            strategy="afterInteractive"
          />
        ) : null}
        <FavoritesProvider isLoggedIn={isLoggedIn}>
          <div className="site-chrome">
            <div className="site-top">
              <SiteHeader />
            </div>
          </div>
          <main>{children}</main>
          <SiteFooter />
          <BackToTop />
          <RevealInit />
          <OmnisendSnippet />
          <Analytics />
        </FavoritesProvider>
      </body>
    </html>
  )
}
