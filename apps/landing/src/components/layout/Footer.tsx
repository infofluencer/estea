import Image from 'next/image'
import { contact } from '@/data/content'
import { corporateLinks, legalLinks, navLinks, shopLinks, shopProductsUrl, type NavLink } from '@/lib/site'
import Btn from '@/components/ui/Btn'
import { socialIcon } from '@/components/ui/SocialIcons'

const year = new Date().getFullYear()

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

const labelClass = 'text-[0.78rem] font-bold tracking-[0.14em] text-gold uppercase'
const linkClass =
  'underline-offset-4 transition-colors hover:text-cream hover:underline focus:outline-none focus-visible:text-cream focus-visible:underline'

function LinkColumn({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className={labelClass}>{title}</h2>
      <ul className="mt-4 flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} {...(link.external ? ext : {})} className={`inline-block py-1 text-[0.95rem] text-cream/80 ${linkClass}`}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Corporate close in three bands: contact (heading + details), then identity
 * and link columns, then the legal strip. The footer is also the contact section.
 */
export default function Footer() {
  const corporate = corporateLinks.filter((l) => l.href !== '#iletisim')

  return (
    <footer id="iletisim" aria-labelledby="iletisim-baslik" className="relative z-20 bg-garden-dark text-cream">
      {/* Band 1 — contact */}
      <div className="mx-auto max-w-7xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <h2 id="iletisim-baslik" className="headline text-[clamp(2.6rem,4.8vw,4.4rem)] leading-[0.95] tracking-[-0.03em] text-cream">
              {contact.title}
            </h2>
            <p className="mt-5 max-w-[38ch] text-[1.1rem] leading-[1.55] text-cream/80">{contact.lead}</p>
            <div className="mt-8">
              <Btn href={shopProductsUrl} variant="gold">
                Mağazaya git
              </Btn>
            </div>
          </div>

          <dl className="grid gap-x-10 gap-y-8 rounded-2xl border border-cream/15 p-8 sm:grid-cols-2 sm:p-10 lg:col-span-7">
            <div>
              <dt className={labelClass}>Telefon</dt>
              <dd className="mt-2">
                <a href={contact.phone.href} className={`text-[1.6rem] leading-none font-semibold text-cream ${linkClass}`}>
                  {contact.phone.label}
                </a>
                <p className="mt-2 text-[0.95rem] text-cream/70">{contact.hours}</p>
              </dd>
            </div>

            <div>
              <dt className={labelClass}>Adres</dt>
              <dd className="mt-2 text-[1.05rem] leading-[1.55] text-cream/90">
                <address className="not-italic">
                  {contact.address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
                <a href={contact.mapHref} {...ext} className={`mt-2 inline-block text-[0.95rem] font-semibold text-cream ${linkClass}`}>
                  Haritada aç
                </a>
              </dd>
            </div>

            <div>
              <dt className={labelClass}>Şirket</dt>
              <dd className="mt-2 text-[1.05rem] leading-[1.55] text-cream/90">{contact.company}</dd>
            </div>

            <div>
              <dt className={labelClass}>Sosyal medya</dt>
              <dd className="mt-3 flex flex-wrap gap-3">
                {contact.socials.map((s) => {
                  const Icon = socialIcon(s.label)
                  return (
                    <a
                      key={s.href}
                      href={s.href}
                      {...ext}
                      aria-label={s.label}
                      title={s.label}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-cream/30 text-cream transition-colors hover:border-gold hover:bg-gold hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-garden-dark"
                    >
                      {Icon ? <Icon className="h-5 w-5" /> : <span className="text-[0.8rem] font-bold">{s.label}</span>}
                    </a>
                  )
                })}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Band 2 — identity and links */}
      <div className="border-t border-cream/15">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Image src="/logo.png" alt="Esçay" width={180} height={96} className="h-14 w-auto" />
            <p className="mt-6 max-w-[32ch] text-[1rem] leading-[1.55] text-cream/80">
              Karadeniz’in yüksek rakımlı bahçelerinden, katkısız harmanlanan çay.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7 lg:col-start-6">
            <LinkColumn title="Keşfet" links={navLinks} />
            <LinkColumn title="Kurumsal" links={corporate} />
            <LinkColumn title="Mağaza" links={shopLinks} />
          </div>
        </div>
      </div>

      {/* Band 3 — legal */}
      <div className="border-t border-cream/15">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-[0.85rem] text-cream/70 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {year} {contact.company} Tüm hakları saklıdır.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} {...ext} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
