import { contact } from '@/data/content'
import { shopProductsUrl } from '@/lib/site'
import { Glass } from '@/components/ui/Doodles'
import Btn from '@/components/ui/Btn'

/**
 * Contact on a full brand-red field. The phone number is the headline-sized
 * element: it is the one thing a visitor here comes to do.
 */
export default function Contact() {
  return (
    <section id="iletisim" aria-labelledby="iletisim-baslik" className="relative z-10 overflow-hidden bg-brand py-24 text-cream sm:py-32">
      <Glass className="pointer-events-none absolute -right-10 -bottom-10 hidden h-[26rem] w-[26rem] text-brand-dark lg:block" />

      <div className="relative mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <h2 id="iletisim-baslik" className="headline text-[clamp(2.8rem,5.6vw,5.4rem)] leading-[0.92] tracking-[-0.03em] text-gold">
            {contact.title}
          </h2>
          <p className="mt-5 max-w-[36ch] text-[1.1rem] leading-[1.5] font-medium sm:text-[1.2rem]">{contact.lead}</p>

          <a
            href={contact.phone.href}
            className="headline mt-10 inline-block text-[clamp(2.6rem,6.4vw,5.6rem)] leading-none tracking-[-0.02em] text-cream decoration-gold decoration-[6px] underline-offset-[10px] transition-colors hover:text-gold focus:outline-none focus-visible:underline"
          >
            {contact.phone.label}
          </a>
          <p className="mt-4 text-[1.05rem]">{contact.hours}</p>

          <div className="mt-10">
            <Btn href={shopProductsUrl} variant="gold">
              Mağazaya git
            </Btn>
          </div>
        </div>

        <div className="flex flex-col gap-10 lg:col-span-4 lg:col-start-9 lg:pt-4">
          <div>
            <h3 className="text-[1.15rem] font-bold text-gold">Adres</h3>
            <address className="mt-2 text-[1.05rem] leading-[1.55] not-italic">
              {contact.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <a
              href={contact.mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block font-semibold underline decoration-gold decoration-2 underline-offset-4 hover:text-gold"
            >
              Haritada aç
            </a>
          </div>

          <div>
            <h3 className="text-[1.15rem] font-bold text-gold">Takip edin</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {contact.socials.map((s) => (
                <li key={s.href}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center rounded-full border border-cream/50 px-4 text-[0.95rem] font-semibold transition-colors hover:border-gold hover:bg-gold hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
