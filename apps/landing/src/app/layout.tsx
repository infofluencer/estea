import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { fontVariables } from '@estea/ui/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Esçay — Yapraktan bardağa, gerçek çay',
  description:
    "Rize ve Artvin'in yüksek bahçelerinden, katkısız harmanlanan Karadeniz çayı. Her yudumda Karadeniz.",
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
