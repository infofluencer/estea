import Image from 'next/image'
import { history } from '@/data/content'
import { Teapot } from '@/components/ui/Doodles'

/**
 * Short history on a full gold field: the heading holds on the left while the
 * years run down the right, each set large in brand red with one plain sentence.
 * The last entry is today, closed with the Esçay seal.
 */
export default function History() {
  return (
    <section id="tarihce" aria-labelledby="tarihce-baslik" className="relative z-10 bg-gold py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <Teapot className="h-20 w-20 text-brand-dark" />
            <h2
              id="tarihce-baslik"
              className="headline mt-6 max-w-[11ch] text-[clamp(2.8rem,5.6vw,5.4rem)] leading-[0.92] tracking-[-0.03em] text-brand-dark"
            >
              {history.title}
            </h2>
            <p className="mt-6 max-w-[34ch] text-[1.1rem] leading-[1.5] font-medium sm:text-[1.2rem]">{history.lead}</p>
          </div>
        </div>

        <ol className="flex flex-col gap-14 lg:col-span-6 lg:col-start-7 lg:gap-20">
          {history.entries.map((e, i) => {
            const last = i === history.entries.length - 1
            return (
              <li key={e.when} className="grid gap-x-8 gap-y-3 sm:grid-cols-[17rem_1fr] lg:grid-cols-[15rem_1fr] xl:grid-cols-[17rem_1fr] sm:items-baseline">
                <p className="headline text-[clamp(3.4rem,5.6vw,5.2rem)] whitespace-nowrap leading-[0.85] tracking-[-0.03em] text-brand">{e.when}</p>
                <div>
                  <h3 className="text-[1.35rem] font-bold">{e.title}</h3>
                  <p className="mt-2 max-w-[38ch] text-[1.05rem] leading-[1.5]">{e.body}</p>
                  {last && (
                    <Image src="/logo.png" alt="Esçay" width={180} height={96} className="mt-6 h-16 w-auto -rotate-[6deg]" />
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
