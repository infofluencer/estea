import type { Metadata } from 'next'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import AboutHeader from '@/components/about/AboutHeader'
import Factory from '@/components/about/Factory'
import History from '@/components/about/History'

export const metadata: Metadata = {
  title: 'Hakkımızda — Esçay',
  description:
    'Esçay, Hayrat’ta çay bahçelerinin ortasındaki fabrikasında yüksek Karadeniz yaprağını katkısız harmanlar. Fabrika ve Karadeniz’de çayın yüz yılı.',
  openGraph: {
    title: 'Esçay hakkında',
    description: 'Bahçenin içinde bir fabrika; yüksek Karadeniz yaprağı, katkısız harman.',
    locale: 'tr_TR',
    type: 'website',
  },
}

export default function AboutPage() {
  return (
    <>
      <SkipLink />
      <Navbar tone="ink" />
      <main id="icerik">
        <AboutHeader />
        <Factory />
        <History />
      </main>
      <Footer />
      <RevealInit />
      <LeafCursor />
    </>
  )
}
