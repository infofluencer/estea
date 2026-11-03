import ArtPhoto from '@/components/ui/ArtPhoto'
import { history } from '@/data/content'

/* Her döneme yaprağın yolculuğundaki renk sırasından bir disk. */
const discs = ['bg-leaf text-ink', 'bg-olive text-cream', 'bg-gold text-ink', 'bg-amber text-cream', 'bg-brand text-cream']

/**
 * Karadeniz'de çayın yüz yılı: hasat karesi solda yapışkan, sağda beş dönem
 * alt alta; yıl kendi renginde bir diskte, başlık ve cümle yanında. Son
 * dönem (Bugün) Esçay'dır ve kendi fotoğrafını taşır.
 */
export default function History() {
  return (
    <section id="tarihce" aria-labelledby="tarihce-baslik" className="relative z-10 bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <header data-reveal className="max-w-[60ch]">
          <h2 id="tarihce-baslik" className="headline text-[clamp(2.4rem,4.6vw,4rem)] leading-[0.95] tracking-[-0.025em] text-amber">
            {history.title}
          </h2>
          <p className="mt-5 text-[1.1rem] leading-[1.55] text-ink/75 sm:text-[1.2rem]">{history.lead}</p>
        </header>

        <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12 lg:gap-8">
          <figure data-reveal className="lg:col-span-5 lg:self-start lg:sticky lg:top-28">
            <div className="relative aspect-[40/39] overflow-hidden rounded-2xl bg-paper sm:aspect-[4/5]">
              <ArtPhoto photo={history.image} />
            </div>
            <figcaption className="mt-3 text-[1rem] text-ink/60">{history.image.caption}</figcaption>
          </figure>

          <ol className="flex flex-col gap-10 lg:col-span-6 lg:col-start-7">
            {history.entries.map((e, i) => {
              const last = i === history.entries.length - 1
              return (
                <li key={e.when} data-reveal style={{ '--reveal-delay': `${(i % 3) * 70}ms` } as React.CSSProperties} className="grid grid-cols-[4.5rem_1fr] items-start gap-x-5 sm:grid-cols-[5.5rem_1fr]">
                  <span className={`headline flex aspect-square w-full items-center justify-center rounded-full text-[1rem] leading-none sm:text-[1.15rem] ${discs[i]}`}>
                    {e.when}
                  </span>
                  <div>
                    <h3 className="headline text-[clamp(1.5rem,2.2vw,2rem)] leading-[1.05]">{e.title}</h3>
                    <p className="mt-2 max-w-[46ch] text-[1.125rem] leading-[1.6] text-ink/75">{e.body}</p>
                    {last ? (
                      <div className="relative mt-5 aspect-[40/39] overflow-hidden rounded-2xl bg-paper sm:aspect-[16/10]">
                        <ArtPhoto photo={history.todayImage} />
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
