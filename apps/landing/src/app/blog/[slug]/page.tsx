import type { Metadata } from 'next'
import ArtPhoto from '@/components/ui/ArtPhoto'
import { notFound } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import Btn from '@/components/ui/Btn'
import PostBody from '@/components/blog/PostBody'
import PostCard from '@/components/blog/PostCard'
import { blogPage, postBySlug, posts } from '@/data/posts'

type Params = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = postBySlug((await params).slug)
  if (!post) return {}
  return {
    title: `${post.title} — Esçay`,
    description: post.excerpt,
    openGraph: { title: post.title, description: post.excerpt, locale: 'tr_TR', type: 'article', images: [{ url: post.image }] },
  }
}

/**
 * Tek yazı: tarih, başlık ve özet dar bir ölçüde, altında geniş kare,
 * gövde okuma genişliğinde. Sonda üç başka yazı ve listeye dönüş.
 */
export default async function PostPage({ params }: Params) {
  const post = postBySlug((await params).slug)
  if (!post) notFound()
  const others = posts.filter((p) => p.slug !== post.slug).slice(0, 3)

  return (
    <>
      <SkipLink />
      <Navbar tone="ink" />
      <main id="icerik">
        <article className="relative z-10 bg-linen pt-32 pb-24 text-ink sm:pt-40 sm:pb-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <header className="grid gap-x-8 gap-y-8 lg:grid-cols-12">
              <h1 data-reveal className="headline text-[clamp(2.1rem,5.2vw,4.6rem)] leading-[0.95] tracking-[-0.03em] lg:col-span-12">
                {post.title}
              </h1>
              <div data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="lg:col-span-4 lg:self-start lg:pt-2">
                <p className="text-[clamp(1.2rem,1.6vw,1.45rem)] leading-[1.45] font-medium">{post.excerpt}</p>
                <p className="mt-5 text-[1rem] text-ink/60">
                  <time dateTime={post.date}>{post.dateLabel}</time>
                </p>
              </div>
              <div data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className={`relative overflow-hidden rounded-2xl bg-paper sm:aspect-[16/10] lg:col-span-8 lg:col-start-5 ${post.imageMobile ? 'aspect-[40/39]' : 'aspect-[16/10]'}`}>
                <ArtPhoto photo={{ src: post.image, mobile: post.imageMobile, alt: post.alt }} priority />
              </div>
            </header>
            <div className="mt-14 max-w-[62ch] lg:mt-20" data-reveal>
              <PostBody blocks={post.body} />
            </div>
            <div className="mt-12">
              <Btn href="/blog" variant="garden">
                {blogPage.back}
              </Btn>
            </div>
          </div>
        </article>

        <section aria-labelledby="diger-baslik" className="relative z-10 bg-paper py-24 text-ink sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <h2 id="diger-baslik" className="headline text-[clamp(2rem,3.6vw,3rem)] leading-[0.95] tracking-[-0.025em]">
              {blogPage.more}
            </h2>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:gap-x-12">
              {others.map((p, i) => (
                <div key={p.slug} data-reveal style={{ '--reveal-delay': `${i * 80}ms` } as React.CSSProperties}>
                  <PostCard post={p} />
                </div>
              ))}
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
