import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { fontVariables } from '@estea/ui/fonts'
import './globals.css'

/** Paylaşım önizlemelerinin mutlak adresi; geçici Dokploy adresinde build argümanıyla verilir. */
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://esteacay.com').replace(/\/+$/, '')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Esçay — Yapraktan bardağa, gerçek çay',
  description:
    "Karadeniz'in yüksek rakımlı bahçelerinden, katkısız harmanlanan çay. Her yudumda Karadeniz.",
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Esçay — Yapraktan bardağa, gerçek çay',
    description: "Karadeniz'in yüksek bahçelerinden, katkısız harmanlanan çay.",
    locale: 'tr_TR',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
