'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import ArtPhoto from '@/components/ui/ArtPhoto'
import Btn from '@/components/ui/Btn'
import { blogPage, posts, type Post } from '@/data/posts'
import { teaBySlug, teas, type TeaSlug } from '@/data/shelf'

/* Navbar ile aynı kenar boşlukları. */
const frame = 'mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-10'

const teaNames = (post: Post) => post.teas.map((t) => teaBySlug(t.slug).short).join(' ve ')

/**
 * Başlık bir cümle: "Çay" ile "üzerine" arasındaki boşluğu bahçe karesi
 * doldurur; altında en yeni yazı tam genişlikte. Sonra solda çay süzgeci,
 * sağda öteki yazılar; paket seçince o çayın bütün yazıları listelenir.
 */
export default function BlogIndex() {
  const [picked, setPicked] = useState<TeaSlug | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [lead] = posts
  const shown = picked ? posts.filter((p) => p.teas.some((t) => t.slug === picked)) : posts.slice(1)
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
      <section aria-labelledby="blog-baslik" className="relative z-10 bg-linen pt-36 pb-24 text-ink sm:pt-44 lg:pb-36">
        <div className={frame}>
          <h1
            id="blog-baslik"
            className="headline flex flex-col text-[19vw] leading-[0.92] tracking-[-0.035em] sm:flex-row sm:items-baseline sm:gap-[0.18em] sm:text-[clamp(4.5rem,10.5vw,10rem)]"
          >
            <span>Çay</span>
            {/* Cümlenin ortasındaki kelime: bahçe. Telefonda iki kelimenin arasında kendi satırında. */}
            <span
              aria-hidden="true"
              className="shutter relative my-[0.12em] block aspect-[2/1] w-full overflow-hidden rounded-2xl bg-leaf-soft sm:my-0 sm:aspect-auto sm:h-[0.72em] sm:min-w-0 sm:flex-1"
            >
              <ArtPhoto
                photo={{ src: '/yolculuk/yetistir-2.jpg', mobile: '/yolculuk/yetistir-2-k.jpg', focus: '50% 55%' }}
                alt=""
                priority
                className="shutter-img"
              />
            </span>
            <span>üzerine</span>
          </h1>

          <p className="mt-10 max-w-[38ch] text-[1.35rem] leading-[1.45] sm:mt-14 sm:text-[1.6rem]">{blogPage.lead}</p>

          {/* En yeni yazı: başlıktaki şeridin açılmış hâli. */}
          <article className="mt-16 sm:mt-24" data-reveal>
            <a
              href={`/blog/${lead.slug}`}
              className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen"
            >
              <span className="relative block aspect-[40/39] overflow-hidden rounded-2xl bg-paper sm:aspect-[21/9]">
                <ArtPhoto
                  photo={{ src: lead.image, mobile: lead.imageMobile }}
                  alt={lead.alt}
                  className="transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
                />
              </span>
              <span className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-12 lg:gap-x-10">
                <h2 className="headline text-[clamp(2.2rem,4.4vw,4rem)] leading-[1] tracking-[-0.025em] transition-colors group-hover:text-brand lg:col-span-7">
                  {lead.title}
                </h2>
                <span className="flex flex-col gap-4 lg:col-span-5 lg:pt-2">
                  <span className="text-[1.15rem] leading-[1.5]">{lead.excerpt}</span>
                  <span className="flex flex-wrap justify-between gap-x-4 text-[1rem]">
                    <time dateTime={lead.date}>{lead.dateLabel}</time>
                    <span className="font-semibold text-brand">Yanına {teaNames(lead)}</span>
                  </span>
                </span>
              </span>
            </a>
          </article>
        </div>
      </section>

      <section id="yazilar" aria-labelledby="yazilar-baslik" className="relative z-10 bg-paper pt-20 pb-28 text-ink sm:pt-28 lg:pt-36 lg:pb-40">
        <div className={`${frame} lg:grid lg:grid-cols-12 lg:gap-x-10`}>
          {/* Süzgeç: masaüstünde solda yapışık sütun, telefonda yazıların üstünde üçerli ızgara. */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-10">
              <h2 id="yazilar-baslik" aria-live="polite" className="headline text-[clamp(2.2rem,3.2vw,3rem)] leading-[1] tracking-[-0.025em]">
                {tea ? blogPage.teaTitle(tea.short) : blogPage.listTitle}
              </h2>
              <p className="mt-4 max-w-[30ch] text-[1.1rem] leading-[1.5]">{blogPage.pick}</p>

              <ul className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-1 lg:gap-1">
                {teas.map((t) => {
                  const on = picked === t.slug
                  return (
                    <li key={t.slug}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPicked(on ? null : t.slug)}
                        className={`group flex w-full flex-col items-start gap-2 rounded-2xl p-2 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] motion-reduce:transition-none lg:flex-row lg:items-center lg:gap-4 ${on ? t.soft : 'hover:bg-linen'}`}
                      >
                        <span className={`relative block aspect-square w-full shrink-0 rounded-xl lg:h-16 lg:w-16 ${t.soft}`}>
                          <Image
                            src={t.image}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 64px, 30vw"
                            className="object-contain p-1.5 transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                          />
                        </span>
                        <span className={`text-[1rem] leading-[1.2] font-semibold lg:text-[1.2rem] ${on ? 'text-ink' : ''}`}>{t.short}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Masaüstünde yer ayrılı: düğmeler gelince süzgeç kaymasın. */}
              <div className={`mt-6 min-h-12 flex-wrap items-center gap-x-6 gap-y-3 ${tea ? 'flex' : 'hidden lg:flex'}`}>
                {tea ? (
                  <>
                    <Btn key={tea.slug} href={tea.href} variant="brand" external>
                      {blogPage.teaCta(tea.short)}
                    </Btn>
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="font-semibold underline decoration-ink/30 decoration-[1.5px] underline-offset-[6px] transition-colors hover:decoration-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {blogPage.all}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div ref={listRef} className="mt-14 lg:col-span-8 lg:col-start-5 lg:mt-0">
            {shown.length ? (
              <ul className="flex flex-col gap-14 sm:gap-16">
                {shown.map((post, i) => (
                  <li key={`${picked}-${post.slug}`} data-reveal style={{ '--reveal-delay': `${Math.min(i, 3) * 70}ms` } as React.CSSProperties}>
                    <article>
                      <a
                        href={`/blog/${post.slug}`}
                        className="group grid gap-5 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center sm:gap-10"
                      >
                        <span className="relative block aspect-[40/39] overflow-hidden rounded-2xl bg-linen sm:aspect-[4/3]">
                          <ArtPhoto
                            photo={{ src: post.image, mobile: post.imageMobile }}
                            alt={post.alt}
                            className="transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transition-none"
                          />
                        </span>
                        <span className="flex flex-col gap-3">
                          <h3 className="headline text-[clamp(1.8rem,2.6vw,2.4rem)] leading-[1.05] tracking-[-0.02em] transition-colors group-hover:text-brand">{post.title}</h3>
                          <span className="max-w-[48ch] text-[1.05rem] leading-[1.5]">{post.excerpt}</span>
                          <span className="flex flex-wrap justify-between gap-x-4 text-[1rem]">
                            <time dateTime={post.date}>{post.dateLabel}</time>
                            <span className="font-semibold text-brand">Yanına {teaNames(post)}</span>
                          </span>
                        </span>
                      </a>
                    </article>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    </>
  )
}
