'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import ArtPhoto from '@/components/ui/ArtPhoto'
import Btn from '@/components/ui/Btn'
import PostCard from '@/components/blog/PostCard'
import { blogPage, posts } from '@/data/posts'
import { teaBySlug, teas, type TeaSlug } from '@/data/shelf'

/* Çerçeveler duvardaki baskılar gibi: her biri kendi genişliğinde, kendi yüksekliğinde. */
const frames = [
  { col: 'lg:col-span-7', ratio: 'sm:aspect-[16/10]' },
  { col: 'lg:col-span-4 lg:col-start-9 lg:mt-24', ratio: 'sm:aspect-[4/5]' },
  { col: 'lg:col-span-4 lg:col-start-2', ratio: 'sm:aspect-square' },
  { col: 'lg:col-span-6 lg:col-start-7 lg:mt-16', ratio: 'sm:aspect-[16/10]' },
  { col: 'lg:col-span-7', ratio: 'sm:aspect-[16/10]' },
  { col: 'lg:col-span-4 lg:col-start-9 lg:mt-24', ratio: 'sm:aspect-[4/5]' },
]

/* Sol kenarı navbar ve max-w-7xl ile hizalayan iç boşluk. */
const edge = 'max(1.25rem, calc((100vw - 80rem) / 2 + 2rem))'

/**
 * İlk ekran iki yarım: solda başlık ve seçili çayın en yeni yazısı, bir ton
 * koyu sağ yarıda çay paketleri. Paket seçince yazılar o çaya göre süzülür.
 */
export default function BlogIndex() {
  const [picked, setPicked] = useState<TeaSlug | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const shown = picked ? posts.filter((p) => p.teas.some((t) => t.slug === picked)) : posts
  const [lead, ...rest] = shown
  const tea = picked ? teaBySlug(picked) : null

  /* Süzgeçle yeni gelen kartlar RevealInit'in gözlemediği düğümlerdir. */
  useEffect(() => {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)')
    if (!nodes?.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    )
    nodes.forEach((node) => io.observe(node))
    return () => io.disconnect()
  }, [picked])

  return (
    <>
      <section aria-labelledby="blog-baslik" className="relative z-10 grid bg-linen text-ink lg:min-h-svh lg:grid-cols-2">
        <div className="pt-32 pb-10 max-lg:px-5 sm:max-lg:px-8 lg:pt-36 lg:pr-12 lg:pb-16 lg:[padding-left:var(--edge)]" style={{ '--edge': edge } as React.CSSProperties}>
          <h1 id="blog-baslik" className="headline caption-in text-[clamp(3.2rem,6.2vw,5.6rem)] leading-[1.05] tracking-[-0.035em] motion-reduce:animate-none">
            {blogPage.title}
          </h1>
          <p className="mt-5 max-w-[44ch] text-[1.2rem] leading-[1.5]">{blogPage.lead}</p>

          {/* Öne çıkan yazı: masaüstünde burada, daha darda listenin başında (süzgeç yazıların üstünde kalsın). */}
          <a
            key={lead.slug}
            href={`/blog/${lead.slug}`}
            className="caption-in group mt-8 hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen motion-reduce:animate-none lg:block"
          >
            <span className="relative block aspect-[16/9] overflow-hidden rounded-2xl bg-paper">
              <ArtPhoto photo={{ src: lead.image, mobile: lead.imageMobile }} priority className="transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none" />
            </span>
            <span className="headline mt-4 block text-[clamp(1.8rem,2.8vw,2.6rem)] leading-[1.05] tracking-[-0.02em] transition-colors group-hover:text-brand">{lead.title}</span>
            <span className="mt-3 flex flex-wrap justify-between gap-x-4 text-[1rem]">
              <time dateTime={lead.date}>{lead.dateLabel}</time>
              <span className="font-semibold text-brand">Yanına {lead.teas.map((t) => teaBySlug(t.slug).short).join(' ve ')}</span>
            </span>
          </a>
        </div>

        <div className="bg-paper pt-8 pb-10 max-lg:px-5 sm:max-lg:px-8 lg:pt-36 lg:pb-16 lg:pl-12 lg:[padding-right:var(--edge)]" style={{ '--edge': edge } as React.CSSProperties}>
          <div className="flex min-h-7 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-[1.1rem] font-semibold">{blogPage.pick}</p>
            {picked ? (
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="font-semibold underline decoration-ink/30 decoration-[1.5px] underline-offset-[6px] transition-colors hover:decoration-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {blogPage.all}
              </button>
            ) : null}
          </div>
          <ul className="mt-5 grid grid-cols-3 gap-2 sm:gap-3 lg:pb-8">
            {teas.map((t, i) => {
              const on = picked === t.slug
              return (
                <li key={t.slug} className={i % 3 === 1 ? 'lg:translate-y-8' : ''}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked(on ? null : t.slug)}
                    className={`group flex w-full flex-col rounded-2xl p-2 pb-3 text-left transition-[opacity,transform,box-shadow] duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none sm:p-3 ${t.soft} ${on ? 'ring-[3px] ring-ink' : ''} ${picked && !on ? 'opacity-55 hover:opacity-100' : ''}`}
                  >
                    <span className="relative block aspect-square w-full transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none lg:aspect-[3/4]">
                      <Image src={t.image} alt="" fill sizes="(min-width: 1024px) 18vw, 36vw" className="object-contain p-1 lg:p-2" />
                    </span>
                    <span className="mt-2 block text-[0.9rem] leading-[1.2] font-semibold sm:text-[1rem]">{t.short}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {/* Yer ayrılı: düğme gelince paketler kaymasın. */}
          <div className="mt-5 min-h-12 lg:mt-14">
            {tea ? (
              <Btn key={tea.slug} href={tea.href} variant="brand" external>
                {blogPage.teaCta(tea.short)}
              </Btn>
            ) : null}
          </div>
        </div>
      </section>

      {/* Tek yazılı çayda masaüstünde yazı zaten ilk ekranda; boş başlık açılmasın. */}
      <section aria-labelledby="yazilar-baslik" className={`relative z-10 bg-linen pt-14 pb-24 text-ink sm:pb-32 lg:pt-32 ${rest.length ? '' : 'lg:hidden'}`}>
        <div ref={listRef} className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 id="yazilar-baslik" aria-live="polite" className="headline text-[clamp(2.2rem,4.4vw,4rem)] leading-[1] tracking-[-0.025em]">
            {tea ? blogPage.teaTitle(tea.short) : blogPage.listTitle}
          </h2>

          <div className="mt-10 grid gap-y-12 sm:grid-cols-2 sm:gap-x-8 lg:mt-16 lg:grid-cols-12 lg:gap-y-20">
            {/* Masaüstünde öne çıkan yazı ilk ekranda; telefonda ve tablette listenin başında. */}
            <div className="sm:col-span-2 lg:hidden">
              <PostCard key={lead.slug} post={lead} wide />
            </div>
            {rest.map((post, i) => {
              const frame = frames[i % frames.length]
              return (
                <div key={post.slug} data-reveal className={frame.col}>
                  <PostCard post={post} ratio={frame.ratio} />
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
