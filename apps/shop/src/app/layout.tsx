import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { fontVariables } from '@estea/ui/fonts'
import ShopFooter from '@/components/layout/ShopFooter'
import ShopHeader from '@/components/layout/ShopHeader'
import { BagProvider } from '@/features/bag/BagProvider'
import { siteUrl } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Çaylarımız — Esçay Mağaza',
    template: '%s — Esçay Mağaza',
  },
  description: 'Rize ve Artvin yaylalarından özenle toplanan Esçay harmanları.',
  icons: { icon: '/favicon.svg' },
}

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={fontVariables}>
      <body>
        <BagProvider>
          <div className="min-h-screen bg-white">
            <ShopHeader />
            <main>{children}</main>
            <ShopFooter />
          </div>
        </BagProvider>
      </body>
    </html>
  )
}
