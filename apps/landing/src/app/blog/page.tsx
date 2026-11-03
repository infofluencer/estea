import type { Metadata } from 'next'
import Image from 'next/image'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import PostCard from '@/components/blog/PostCard'
import { blogPage, posts } from '@/data/posts'

export const metadata: Metadata = {
  title: 'Blog — Esçay',
  description: blogPage.lead,
  openGraph: { title: 'Esçay blog', description: blogPage.lead, locale: 'tr_TR', type: 'website' },
}

/**
 * Yazılar, ana sayfadaki blog bölümünün düzeninde: mühür, başlık ve giriş
 * ilk sütunda yapışkan; en yeni yazı iki sütuna yayılır, kalanlar üçer
 * sütunlu sıralarda devam eder.
 */
export default function BlogPage() {
  const [latest, ...rest] = posts
  return (
    <>
      <SkipLink />
      <Navbar tone="ink" />
      <main id="icerik">
        <section aria-labelledby="blog-baslik" className="relative z-10 bg-linen pt-32 pb-28 text-ink sm:pt-40 sm:pb-36">
          <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-10 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:gap-y-12 xl:gap-x-12">
            <header className="border-t border-ink/15 pt-6 sm:col-span-2 lg:col-span-1 lg:row-span-2" data-reveal>
              <div className="lg:sticky lg:top-28">
                <Image src="/logo.png" alt="" width={341} height={182} className="h-20 w-auto -rotate-[8deg] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)] sm:h-24" />
                <h1 id="blog-baslik" className="headline mt-8 text-[clamp(2.4rem,3vw,2.8rem)] leading-[1] tracking-[-0.025em] text-ink">
                  {blogPage.title}
                </h1>
                <p className="mt-4 max-w-[24ch] text-[1.2rem] leading-[1.5] text-ink/75">{blogPage.lead}</p>
              </div>
            </header>
            <div className="sm:col-span-2 lg:col-span-3" data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties}>
              <PostCard post={latest} wide priority />
            </div>
            {rest.map((post, i) => (
              <div key={post.slug} data-reveal style={{ '--reveal-delay': `${(i % 3) * 80}ms` } as React.CSSProperties}>
                <PostCard post={post} />
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
      <RevealInit />
      <LeafCursor />
    </>
  )
}
