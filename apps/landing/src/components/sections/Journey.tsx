import Image from 'next/image'
import { journey } from '@/data/content'
import { doodles } from '@/components/ui/Doodles'

/* Disc colour per step, fresh leaf to tavşan kanı, as in the Manifesto facts. */
const discs = ['bg-leaf text-ink', 'bg-olive text-cream', 'bg-gold text-ink', 'bg-amber text-cream', 'bg-brand text-cream', 'bg-brand-dark text-cream']

/**
 * From garden to glass: the six steps as doodle discs under the heading,
 * then six even spreads, photograph on one half and text on the other, sides
 * alternating down the page. Every spread shares the same proportions so the
 * sequence reads as one piece; each verb takes the colour the leaf has at
 * that step, fresh green through gold to tavşan kanı.
 */
export default function Journey() {
  return (
    <section id="yolculuk" aria-labelledby="yolculuk-baslik" className="relative z-10 overflow-hidden bg-linen pt-24 pb-28 text-ink sm:pt-32 sm:pb-36">
      {/* Esçay line pattern (teapots, glasses, sprigs) tiled faintly across the section, fading in at the top and out toward the seal at the bottom. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[url(/pattern/escay-vector.png)] bg-[length:520px_auto] opacity-[0.12] [mask-image:linear-gradient(to_bottom,transparent,#000_160px,#000_calc(100%-260px),transparent)]"
      />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <header className="text-center">
          {/* The seal above the title, as on the pack. */}
          <Image src="/logo.png" alt="" width={341} height={182} className="mx-auto mb-6 h-16 w-auto drop-shadow-[0_8px_12px_rgba(0,0,0,0.2)] sm:h-20" />
          <h2
            id="yolculuk-baslik"
            className="headline text-amber text-[clamp(2.6rem,6.4vw,5.4rem)] leading-[0.95] tracking-[-0.03em] lg:whitespace-nowrap"
          >
            {journey.title}
          </h2>
          <p className="mx-auto mt-5 max-w-[60ch] text-[1.1rem] leading-[1.55] text-ink/75 sm:text-[1.2rem]">{journey.lead}</p>
        </header>

        {/* The six steps at a glance in the site's own idiom: a brand-coloured disc with a line doodle, the verb and its sentence. The discs run the leaf's colours in order. */}
        <nav aria-label="Üretim adımları" className="mt-14 lg:mt-20">
          <ol className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-8">
            {journey.stops.map((stop, i) => {
              const Icon = doodles[stop.icon]
              return (
                <li key={stop.verb}>
                  <a href={`#yolculuk-${i}`} className="group flex flex-col items-start gap-4">
                    <span
                      className={`flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:-rotate-6 ${discs[i]}`}
                    >
                      <Icon className="h-10 w-10" />
                    </span>
                    <span className="headline block text-[1.5rem] leading-none" style={{ color: stop.color }}>
                      {stop.verb}
                    </span>
                    <span className="-mt-1 block max-w-[24ch] text-[0.95rem] leading-[1.45] text-ink/70">{stop.body}</span>
                  </a>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Each spread sits between two hairlines so every step has a clear start and end. */}
        <ol className="mt-20 border-t border-line lg:mt-28">
          {journey.stops.map((stop, i) => {
            const photoLeft = i % 2 === 0
            return (
              <li key={stop.verb} data-reveal className="grid gap-8 border-b border-line py-14 last:border-b-0 last:pb-0 lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-20">
                <div
                  className={`relative aspect-[4/3] overflow-hidden rounded-2xl bg-paper lg:col-span-6 lg:row-start-1 ${photoLeft ? 'lg:col-start-1' : 'lg:col-start-7'}`}
                >
                  <Image src={stop.image} alt="" fill sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 100vw" className="object-cover" />
                </div>
                <div className={`lg:col-span-5 lg:row-start-1 ${photoLeft ? 'lg:col-start-8' : 'lg:col-start-1'}`}>
                  <h3 id={`yolculuk-${i}`} className="headline text-[clamp(2.6rem,5vw,4.8rem)] leading-[0.95] tracking-[-0.02em]" style={{ color: stop.color }}>
                    {stop.verb}
                  </h3>
                  <p className="mt-6 text-[clamp(1.25rem,1.7vw,1.5rem)] leading-[1.4] font-medium">{stop.body}</p>
                  <p className="mt-5 text-[1.125rem] leading-[1.65] text-ink/75">{stop.detail}</p>
                  <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5">
                    {stop.facts.map((f) => (
                      <div key={f.term} className="border-t border-ink/20 pt-3">
                        <dt className="text-[0.9rem] text-ink/55">{f.term}</dt>
                        <dd className="mt-1 text-[1.05rem] leading-[1.35] font-semibold">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
