import ArtPhoto from '@/components/ui/ArtPhoto'
import { brew } from '@/data/blends'
import Btn from '@/components/ui/Btn'

/** Demleme usulü: fotoğraf solda, dört adım ve saklama notu sağda. */
export default function Brew() {
  return (
    <section id="demleme" aria-labelledby="demleme-baslik" className="relative z-10 bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-8">
        <div data-reveal className="relative aspect-[40/39] overflow-hidden rounded-2xl bg-paper sm:aspect-[4/3] lg:col-span-6">
          <ArtPhoto photo={brew.photo} />
        </div>
        <div data-reveal style={{ '--reveal-delay': '100ms' } as React.CSSProperties} className="lg:col-span-5 lg:col-start-8">
          <h2 id="demleme-baslik" className="headline text-[clamp(2.4rem,4.6vw,4rem)] leading-[0.95] tracking-[-0.025em] text-brand-dark">
            {brew.title}
          </h2>
          <p className="mt-5 text-[clamp(1.2rem,1.6vw,1.4rem)] leading-[1.45] font-medium">{brew.lead}</p>
          <ol className="mt-8 flex flex-col gap-4">
            {brew.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink text-[0.95rem] font-bold ${
                    ['bg-leaf text-ink', 'bg-gold text-ink', 'bg-amber text-cream', 'bg-brand text-cream'][i]
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-[1.1rem] leading-[1.55]">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-7 max-w-[46ch] text-[1.125rem] leading-[1.6] text-ink/75">{brew.note}</p>
          <div className="mt-8">
            <Btn href={brew.link.href} variant="garden" external>
              {brew.link.label}
            </Btn>
          </div>
        </div>
      </div>
    </section>
  )
}
