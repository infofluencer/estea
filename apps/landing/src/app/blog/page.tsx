import type { Metadata } from 'next'
import ArtPhoto from '@/components/ui/ArtPhoto'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import Btn from '@/components/ui/Btn'
import BlogIndex from '@/components/blog/BlogIndex'
import { blogPage } from '@/data/posts'
import { shopProductsUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Blog — Esçay',
  description: blogPage.lead,
  openGraph: { title: 'Esçay blog', description: blogPage.lead, locale: 'tr_TR', type: 'website' },
}

/** Yazılar çay süzgeciyle (BlogIndex); kapanışta demleme karesi ve mağaza. */
export default function BlogPage() {
  return (
    <>
      <SkipLink />
      <Navbar tone="ink" />
      <main id="icerik">
        <BlogIndex />
        <section aria-labelledby="kapanis-baslik" className="relative z-10 grid bg-brand text-cream lg:grid-cols-2">
          <div className="relative aspect-[40/39] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[34rem]">
            <ArtPhoto photo={{ src: '/yolculuk/demle-1.jpg', mobile: '/yolculuk/demle-1-k.jpg', alt: 'Tezgâhta ince belli bardakta tavşan kanı çay ve Esçay Gold paketi' }} />
          </div>
          <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:px-16" data-reveal>
            <h2 id="kapanis-baslik" className="headline text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.98] tracking-[-0.025em]">
              {blogPage.closeTitle}
            </h2>
            <p className="mt-5 max-w-[42ch] text-[1.2rem] leading-[1.5]">{blogPage.closeLead}</p>
            <div className="mt-8">
              <Btn href={shopProductsUrl} variant="cream" external>
                {blogPage.closeCta}
              </Btn>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <RevealInit />
      <LeafCursor />
    </>
  )
}
