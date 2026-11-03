import Image from 'next/image'
import { blends, page } from '@/data/blends'
import Btn from '@/components/ui/Btn'
import FactList from '@/components/ui/FactList'
import VerbMark from '@/components/ui/VerbMark'
import { btnVariant } from './tones'

/**
 * Dört harman, Yolculuk'taki yayılımlarla aynı ölçüde: paket bir yanda kendi
 * renginin düz zemininde, metin öte yanda; yanlar sırayla değişir. Harmanın
 * adı paket etiketi gibi kendi renginde, olgular bilet koçanında.
 */
export default function BlendSpreads() {
  return (
    <section aria-label="Harmanlar tek tek" className="relative z-10 bg-linen text-ink">
      <ol className="mx-auto max-w-7xl px-5 sm:px-8">
        {blends.map((b, i) => {
          const packLeft = i % 2 === 0
          return (
            <li
              key={b.slug}
              id={b.slug}
              className="grid scroll-mt-24 gap-8 py-14 lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-24"
            >
              <div
                data-reveal
                className={`relative aspect-square overflow-hidden rounded-2xl sm:aspect-[5/4] lg:aspect-[4/5] ${b.soft} lg:col-span-6 lg:row-start-1 ${packLeft ? 'lg:col-start-1' : 'lg:col-start-7'}`}
              >
                <Image
                  src={b.image}
                  alt={`${b.name} paketi`}
                  fill
                  sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 100vw"
                  className="object-contain p-3 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] motion-reduce:transition-none sm:p-5"
                />
              </div>
              <div className={`lg:col-span-5 lg:row-start-1 ${packLeft ? 'lg:col-start-8' : 'lg:col-start-1'}`}>
                <h2 data-reveal className="headline text-[clamp(2.4rem,4.6vw,4.4rem)] leading-[0.95] tracking-[-0.02em]">
                  <VerbMark color={b.color} tilt={packLeft ? 1 : -1}>
                    {b.name}
                  </VerbMark>
                </h2>
                <p data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="mt-6 text-[clamp(1.25rem,1.7vw,1.5rem)] leading-[1.4] font-medium">
                  {b.headline}
                </p>
                {b.body.map((p) => (
                  <p key={p} className="mt-5 text-[1.125rem] leading-[1.65] text-ink/75">
                    {p}
                  </p>
                ))}
                <FactList color={b.color} facts={b.facts} />
                <p className="mt-6 text-[1.125rem] leading-[1.5] text-ink/75">{b.compare.paket} paketlerde.</p>
                <div className="mt-6">
                  <Btn href={b.href} variant={btnVariant[b.tone]} external>
                    {page.cta}
                  </Btn>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
