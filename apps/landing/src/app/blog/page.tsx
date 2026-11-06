import type { Metadata } from 'next'
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

/** Yazılar çay süzgeciyle (BlogIndex); kapanış tam kırmızı alanda mağazaya çağırır. */
export default function BlogPage() {
  return (
    <>
      <SkipLink />
      <Navbar tone="ink" />
      <main id="icerik">
        <BlogIndex />
        <section aria-labelledby="kapanis-baslik" className="relative z-10 bg-brand text-cream">
          <div className="mx-auto flex max-w-[90rem] flex-col justify-between gap-12 lg:min-h-[64svh] lg:gap-16 px-5 pt-24 pb-14 sm:px-8 lg:px-10 lg:pt-32 lg:pb-16">
            <h2 id="kapanis-baslik" data-reveal className="headline text-[clamp(3.6rem,11vw,10rem)] leading-[0.92] tracking-[-0.035em]">
              {blogPage.closeTitle}
            </h2>
            <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between" data-reveal style={{ '--reveal-delay': '90ms' } as React.CSSProperties}>
              <p className="max-w-[40ch] text-[1.25rem] leading-[1.5]">{blogPage.closeLead}</p>
              <div className="shrink-0">
                <Btn href={shopProductsUrl} variant="cream" external>
                  {blogPage.closeCta}
                </Btn>
              </div>
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
