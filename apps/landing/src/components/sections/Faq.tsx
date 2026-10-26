import Image from 'next/image'
import { faq } from '@/data/content'
import { shopUrl } from '@/lib/site'
import Btn from '@/components/ui/Btn'

/**
 * FAQ on the linen ground: the seal sits right above the centred title, as
 * on the pack, then the questions run side by side in a three-column grid.
 * Each one is numbered and opens in place; native details/summary, so it
 * works without JavaScript. The round plus fills brand red while open.
 */
export default function Faq() {
  return (
    <section id="sss" aria-labelledby="sss-baslik" className="relative z-10 bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <header className="text-center">
          <Image
            src="/logo.png"
            alt=""
            width={341}
            height={182}
            className="mx-auto mb-5 h-16 w-auto -rotate-[5deg] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)] sm:h-20"
          />
          <h2 id="sss-baslik" className="headline text-[clamp(2.4rem,5vw,4rem)] leading-[0.95] tracking-[-0.025em] text-ink">
            {faq.title}
          </h2>
          <p className="mx-auto mt-4 max-w-[60ch] text-[1.1rem] leading-[1.5] text-ink/75 sm:text-[1.2rem]">{faq.lead}</p>
        </header>

        <dl className="mt-14 grid items-start gap-x-10 gap-y-10 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-12">
          {faq.items.map((item, i) => (
            <details key={item.q} className="group border-t border-ink/15">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-4 pt-6 text-left [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen">
                <span aria-hidden="true" className="label text-brand">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* Outlined disc with a plus; fills brand red and turns into a minus when the answer is open. */}
                <span
                  aria-hidden="true"
                  className="relative row-span-2 size-10 shrink-0 self-start rounded-full border border-ink/25 transition-colors duration-200 group-hover:border-brand group-open:border-brand group-open:bg-brand before:absolute before:top-1/2 before:left-1/2 before:h-0.5 before:w-4 before:-translate-x-1/2 before:-translate-y-1/2 before:bg-ink before:transition-colors group-open:before:bg-cream after:absolute after:top-1/2 after:left-1/2 after:h-4 after:w-0.5 after:-translate-x-1/2 after:-translate-y-1/2 after:bg-ink after:transition-[transform,background-color] group-open:after:scale-y-0 group-open:after:bg-cream"
                />
                <dt className="headline mt-3 text-[clamp(1.3rem,1.8vw,1.6rem)] leading-[1.1] transition-colors group-hover:text-brand group-open:text-brand">
                  {item.q}
                </dt>
              </summary>
              <dd className="mt-4 pr-14 text-[1.05rem] leading-[1.6] text-ink/75">{item.a}</dd>
            </details>
          ))}
        </dl>

        <footer className="mt-14 flex flex-col items-center gap-5 text-center sm:mt-16">
          <p className="max-w-[40ch] text-[1.05rem] leading-[1.5] text-ink/70">{faq.all.note}</p>
          <Btn href={`${shopUrl}/faq`} variant="garden" external>
            {faq.all.label}
          </Btn>
        </footer>
      </div>
    </section>
  )
}
