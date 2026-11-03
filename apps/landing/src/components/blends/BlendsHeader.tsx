import Image from 'next/image'
import ArtPhoto from '@/components/ui/ArtPhoto'
import { blends, page } from '@/data/blends'
import Btn from '@/components/ui/Btn'

/**
 * Sayfanın ilk ekranı: başlık tam genişlikte, altında elek hikâyesi ve
 * seçiciye inen düğme solda, avuçtaki dört boy yaprak sağda. Telefonda
 * fotoğraf başlığın hemen altına gelir, uzun paragraf onun altında kalır.
 * Dört paket en altta, her biri kendi yayılımına atlar.
 */
export default function BlendsHeader() {
  return (
    <section aria-labelledby="harmanlar-baslik" className="relative z-10 bg-linen pt-32 pb-20 text-ink sm:pt-40 lg:pb-28">
      <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-8 px-5 sm:px-8 lg:grid-cols-12 lg:gap-y-10">
        <h1
          id="harmanlar-baslik"
          data-reveal
          className="headline text-[clamp(3rem,7.4vw,6.4rem)] leading-[0.92] tracking-[-0.03em] text-brand lg:col-span-12"
        >
          {page.title}
        </h1>
        <div data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="lg:col-span-5 lg:row-start-2 lg:self-end">
          <p className="max-w-[32ch] text-[clamp(1.2rem,1.6vw,1.45rem)] leading-[1.45] font-medium">{page.lead}</p>
          <div className="mt-7">
            <Btn href={page.choose.href} variant="brand">
              {page.choose.label}
            </Btn>
          </div>
        </div>
        <figure data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-2">
          <div className="relative aspect-[40/39] overflow-hidden rounded-2xl bg-paper sm:aspect-[4/3]">
            <ArtPhoto photo={page.photo} priority />
          </div>
          <figcaption className="mt-3 text-[1rem] text-ink/60">{page.photo.caption}</figcaption>
        </figure>
        <p data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className="max-w-[46ch] text-[1.125rem] leading-[1.65] text-ink/75 lg:col-span-5 lg:row-start-3 lg:self-start">
          {page.body}
        </p>
      </div>

      <nav aria-label="Harmanlar" className="mx-auto mt-16 max-w-7xl px-5 sm:px-8 lg:mt-24">
        <ol className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4 lg:gap-x-8">
          {blends.map((b, i) => (
            <li key={b.slug} data-reveal style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}>
              <a href={`#${b.slug}`} className="group flex flex-col items-start gap-4 focus:outline-none">
                <span className="relative block aspect-square w-full transition-transform duration-300 group-hover:-rotate-2 group-focus-visible:-rotate-2">
                  <Image src={b.image} alt="" fill priority={i < 2} sizes="(min-width: 1024px) 300px, 45vw" className="object-contain" />
                </span>
                <span className="headline block text-[1.5rem] leading-none transition-colors group-hover:text-brand group-focus-visible:text-brand">{b.name}</span>
                <span className="-mt-1 block max-w-[26ch] text-[1rem] leading-[1.45] text-ink/70">{b.summary}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  )
}
