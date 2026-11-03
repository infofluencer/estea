import ArtPhoto from '@/components/ui/ArtPhoto'
import { about } from '@/data/content'
import { aboutPage } from '@/data/about'
import Btn from '@/components/ui/Btn'
import { Glass, Sprig, Teapot } from '@/components/ui/Doodles'

/* Ana sayfadaki üç ilke, aynı renkli disklerle. */
const pointStyle = {
  sprig: { Icon: Sprig, circle: 'bg-leaf text-ink' },
  teapot: { Icon: Teapot, circle: 'bg-gold text-ink' },
  glass: { Icon: Glass, circle: 'bg-brand text-cream' },
}

/**
 * Sayfanın ilk ekranı: başlık tam genişlikte, altında iki cümle ve harmanlara
 * giden düğme solda, bahçelerin ortasındaki fabrika sağda. Üç ilke en altta.
 */
export default function AboutHeader() {
  return (
    <section aria-labelledby="hakkimizda-baslik" className="relative z-10 bg-linen pt-32 pb-20 text-ink sm:pt-40 lg:pb-28">
      <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-8 px-5 sm:px-8 lg:grid-cols-12 lg:gap-y-10">
        <h1
          id="hakkimizda-baslik"
          data-reveal
          className="headline text-[clamp(2.5rem,7.4vw,6.4rem)] leading-[0.92] tracking-[-0.03em] text-garden lg:col-span-12"
        >
          {aboutPage.title}
        </h1>
        <div data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="lg:col-span-5 lg:row-start-2 lg:self-end">
          <p className="max-w-[34ch] text-[clamp(1.2rem,1.6vw,1.45rem)] leading-[1.45] font-medium">{aboutPage.lead}</p>
          <div className="mt-7">
            <Btn href={aboutPage.cta.href} variant="brand">
              {aboutPage.cta.label}
            </Btn>
          </div>
        </div>
        <figure data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className="lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-2">
          <div className="relative aspect-[40/39] overflow-hidden rounded-2xl bg-paper sm:aspect-[4/3]">
            <ArtPhoto photo={aboutPage.photo} priority />
          </div>
          <figcaption className="mt-3 text-[1rem] text-ink/60">{aboutPage.photo.caption}</figcaption>
        </figure>
        <div data-reveal style={{ '--reveal-delay': '160ms' } as React.CSSProperties} className="lg:col-span-5 lg:row-start-3 lg:self-start">
          <p className="max-w-[46ch] text-[1.125rem] leading-[1.65] text-ink/75">{aboutPage.body}</p>
          <ul className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {about.points.map((pt) => {
              const { Icon, circle } = pointStyle[pt.icon]
              return (
                <li key={pt.label} className="flex flex-col items-start gap-3">
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full ${circle}`}>
                    <Icon className="h-10 w-10" />
                  </span>
                  <span className="text-[1rem] leading-snug font-semibold">{pt.label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
