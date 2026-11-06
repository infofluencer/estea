import type { Metadata } from 'next'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import BlendsHeader from '@/components/blends/BlendsHeader'
import BlendSpreads from '@/components/blends/BlendSpreads'
import BlendCompare from '@/components/blends/BlendCompare'
import Brew from '@/components/blends/Brew'
import Shelf from '@/components/sections/Shelf'

export const metadata: Metadata = {
  title: 'Harmanlar — Esçay',
  description:
    'Gold, İlk Hasat, Karadeniz ve Tiryaki: aynı yüksek Karadeniz bahçesinden, elekle ayrılan dört harman. Yaprağı, içimi, dem rengi ve paketleri yan yana.',
  openGraph: {
    title: 'Esçay harmanları',
    description: 'Aynı bahçeden elekle ayrılan dört harman: Gold, İlk Hasat, Karadeniz, Tiryaki.',
    locale: 'tr_TR',
    type: 'website',
  },
}

export default function BlendsPage() {
  return (
    <>
      <SkipLink />
      <Navbar tone="ink" />
      <main id="icerik">
        <BlendsHeader />
        <BlendSpreads />
        <BlendCompare />
        <Brew />
        <Shelf />
      </main>
      <Footer />
      <RevealInit />
      <LeafCursor />
    </>
  )
}
