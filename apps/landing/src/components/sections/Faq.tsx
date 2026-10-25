import { faq } from '@/data/content'
import { shopUrl } from '@/lib/site'
import Btn from '@/components/ui/Btn'

/**
 * FAQ in the same frame as the blog: intro and the link to the full list in
 * a sticky column on the left, the questions as a ruled list on the right.
 * Native details/summary, so it works without JavaScript.
 */
export default function Faq() {
  return (
    <section id="sss" aria-labelledby="sss-baslik" className="relative z-10 bg-linen pt-28 pb-24 text-ink sm:pt-36 sm:pb-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <h2 id="sss-baslik" className="headline text-[clamp(2rem,3vw,2.75rem)] leading-[1] tracking-[-0.02em] text-ink">
              {faq.title}
            </h2>
            <p className="mt-5 max-w-[28ch] text-[1.1rem] leading-[1.5] text-ink/80">{faq.lead}</p>
            <div className="mt-8">
              <Btn href={`${shopUrl}/faq`} variant="garden" external>
                {faq.all.label}
              </Btn>
            </div>
          </div>
        </div>

        <dl className="border-t border-ink/20 lg:col-span-8">
          {faq.items.map((item) => (
            <details key={item.q} className="group border-b border-ink/20">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen">
                <dt className="text-[1.15rem] leading-[1.3] font-bold transition-colors group-hover:text-brand sm:text-[1.3rem]">{item.q}</dt>
                {/* Plus that turns into a minus when the answer is open. */}
                <span
                  aria-hidden="true"
                  className="relative size-6 shrink-0 before:absolute before:top-1/2 before:left-0 before:h-0.5 before:w-full before:-translate-y-1/2 before:bg-ink after:absolute after:top-0 after:left-1/2 after:h-full after:w-0.5 after:-translate-x-1/2 after:bg-ink after:transition-transform group-open:after:scale-y-0"
                />
              </summary>
              <dd className="max-w-[62ch] pb-7 text-[1.05rem] leading-[1.6] text-ink/75">{item.a}</dd>
            </details>
          ))}
        </dl>
      </div>
    </section>
  )
}
