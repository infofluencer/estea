import Image from 'next/image'
import { contact } from '@/data/content'
import { corporateLinks, navLinks, shopProductsUrl } from '@/lib/site'
import BlobBg from '@/components/ui/BlobBg'
import { Glass, Leaf, doodles } from '@/components/ui/Doodles'

const year = new Date().getFullYear()

/* Same pill as the navbar links: outlined in cream, gold when hovered. */
const pillClass =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-cream/45 px-4 text-[0.95rem] font-semibold whitespace-nowrap text-cream transition-colors duration-200 hover:border-gold hover:bg-gold hover:text-ink focus:outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-garden-dark'

/* Corporate links that the page itself already covers (blog, contact) are left out here. */
const corporate = corporateLinks.filter((l) => !/blog|iletisim/.test(l.href))

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

/**
 * A designed close: links in three short groups, then the name set across
 * the full width in gold, then the legal line. No rules; groups are separated by space.
 */
export default function Footer() {
  return (
    <footer className="relative z-20 bg-garden-dark text-cream">
      {/* A soft wave lifts the green over the red contact field, like the wave under the collection. */}
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 block h-[44px] w-full -translate-y-[calc(100%-1px)] text-garden-dark sm:h-[64px]"
        aria-hidden="true"
      >
        <path fill="currentColor" d="M0 58C320 8 760 98 1440 30V90H0Z" />
      </svg>

      <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 sm:pt-20">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Image src="/logo.png" alt="Esçay" width={180} height={96} className="h-16 w-auto" />
            <p className="mt-6 max-w-[30ch] text-[1.1rem] leading-[1.5] font-medium">
              Rakımı yüksek Karadeniz bahçelerinden toplanmış özel Karadeniz çayı.
            </p>
            <a
              href={shopProductsUrl}
              className="group relative isolate mt-8 inline-flex min-h-12 items-center rounded-full px-7 text-[0.8rem] font-bold tracking-[0.14em] text-brand-dark uppercase transition-colors duration-200 hover:text-cream focus:outline-none focus-visible:text-cream focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-garden-dark"
            >
              <BlobBg className="fill-gold group-hover:fill-brand" />
              <span className="blob-label">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Glass className="h-5 w-5 shrink-0" />
                  Online mağaza
                </span>
              </span>
            </a>
          </div>

          {/* Link groups as rows of pills: name on the left, buttons flowing on the right. */}
          <div className="flex flex-col gap-9 lg:col-span-7 lg:col-start-6">
            <nav aria-label="Sayfa" className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-start">
              <h2 className="text-[1.05rem] font-semibold text-gold sm:pt-2.5">Keşfet</h2>
              <ul className="flex flex-wrap gap-2">
                {navLinks.map((link) => {
                  const Icon = doodles[link.icon ?? 'sprig']
                  return (
                    <li key={link.href}>
                      <a href={link.href} className={pillClass}>
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {link.label}
                      </a>
                    </li>
                  )
                })}
                <li>
                  <a href="#iletisim" className={pillClass}>
                    <Leaf className="h-[18px] w-[18px] shrink-0" />
                    İletişim
                  </a>
                </li>
              </ul>
            </nav>

            <nav aria-label="Kurumsal" className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-start">
              <h2 className="text-[1.05rem] font-semibold text-gold sm:pt-2.5">Kurumsal</h2>
              <ul className="flex flex-wrap gap-2">
                {corporate.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} {...ext} className={pillClass}>
                      {link.label}
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="grid gap-4 sm:grid-cols-[8rem_1fr] sm:items-start">
              <h2 className="text-[1.05rem] font-semibold text-gold sm:pt-2.5">Bize ulaşın</h2>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <a href={contact.phone.href} className={pillClass}>
                    {contact.phone.label}
                  </a>
                </li>
                {contact.socials.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} {...ext} className={pillClass}>
                      {s.label}
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* The name returns at full width to close the page. */}
      <p
        aria-hidden="true"
        className="headline mt-16 pb-[0.12em] text-center text-[27vw] leading-[0.9] tracking-[-0.05em] whitespace-nowrap text-gold select-none sm:mt-20"
      >
        esçay
      </p>

      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-8 text-[0.9rem] text-cream/80 sm:flex-row sm:justify-between sm:px-8">
        <p>
          © {year} {contact.company}
        </p>
        <p>Karadeniz’in özel havzalarından.</p>
      </div>
    </footer>
  )
}
