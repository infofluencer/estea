import Image from "next/image"
import Link from "next/link"
import { Btn } from "@/components/brand/Btn"
import { socialIcon } from "@/components/brand/SocialIcons"
import { COMPANY } from "@/lib/company"
import { LEGAL_PAGES } from "@/lib/legal"
import { categoryPath } from "@/lib/urls"

/** Kategori handle'ları backend seed'iyle aynı. */
const SHOP_LINKS = [
  { href: categoryPath("siyah-cay"), label: "Siyah Çay" },
  { href: categoryPath("yesil-cay"), label: "Yeşil Çay" },
  { href: categoryPath("bitki-cayi"), label: "Bitki Çayı" },
  { href: categoryPath("harmanlar"), label: "Harmanlar" },
  { href: categoryPath("hediye"), label: "Hediye" },
]

const DISCOVER_LINKS = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: `${COMPANY.corporateSite}/cayin-yolculugu/`, label: "Çayın Yolculuğu", external: true },
  { href: `${COMPANY.corporateSite}/blog/`, label: "Blog", external: true },
  { href: "/iletisim", label: "İletişim" },
]

const HELP_LINKS = [
  { href: "/sepet", label: "Sepet" },
  { href: "/istek-listesi", label: "Favoriler" },
  { href: "/order-tracking", label: "Sipariş takibi" },
  { href: "/hesabim", label: "Hesabım" },
  { href: "/faq", label: "Sıkça sorulan sorular" },
]

const SOCIALS = [
  { label: "Instagram", href: COMPANY.instagramUrl },
  { label: "Facebook", href: COMPANY.facebookUrl },
]

const ADDRESS_LINES = COMPANY.address.split(", Merkez")
const MAP_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(COMPANY.address)}`

const ext = { target: "_blank", rel: "noopener noreferrer" } as const
const labelClass = "text-[0.78rem] font-bold tracking-[0.14em] text-gold uppercase"
const linkClass =
  "underline-offset-4 transition-colors hover:text-cream hover:underline focus:outline-none focus-visible:text-cream focus-visible:underline"

type FooterLink = { href: string; label: string; external?: boolean }

function LinkColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <h2 className={labelClass}>{title}</h2>
      <ul className="mt-4 flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.href}>
            {link.external ? (
              <a href={link.href} {...ext} className={`inline-block py-1 text-[0.95rem] text-cream/80 ${linkClass}`}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className={`inline-block py-1 text-[0.95rem] text-cream/80 ${linkClass}`}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Landing footer'ı ile aynı üç bant: iletişim (başlık + künye), kimlik ve
 * bağlantı sütunları, yasal şerit. Footer aynı zamanda iletişim bölümüdür.
 */
export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer id="iletisim" aria-labelledby="iletisim-baslik" className="site-footer relative z-20 bg-garden-dark text-cream">
      {/* Bant 1 — iletişim */}
      <div className="mx-auto max-w-7xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <h2 id="iletisim-baslik" className="headline text-[clamp(2.6rem,4.8vw,4.4rem)] leading-[0.95] tracking-[-0.03em] text-cream">
              Bize ulaşın
            </h2>
            <p className="mt-5 max-w-[38ch] text-[1.1rem] leading-[1.55] text-cream/80">
              Siparişiniz, sorunuz ya da bir öneriniz mi var? Hafta içi müşteri hizmetlerimiz sizi dinliyor.
            </p>
            <div className="mt-8">
              <Btn href={categoryPath()} variant="gold">
                Tüm çaylar
              </Btn>
            </div>
          </div>

          <dl className="grid gap-x-10 gap-y-8 rounded-2xl bg-moss/40 p-8 sm:grid-cols-2 sm:p-10 lg:col-span-7">
            <div>
              <dt className={labelClass}>Telefon</dt>
              <dd className="mt-2">
                <a href={COMPANY.phoneHref} className={`text-[1.6rem] leading-none font-semibold text-cream ${linkClass}`}>
                  {COMPANY.phone}
                </a>
                <p className="mt-2 text-[0.95rem] text-cream/70">{COMPANY.hours}</p>
              </dd>
            </div>

            <div>
              <dt className={labelClass}>Adres</dt>
              <dd className="mt-2 text-[1.05rem] leading-[1.55] text-cream/90">
                <address className="not-italic">
                  <span className="block">{ADDRESS_LINES[0]}</span>
                  {ADDRESS_LINES[1] ? <span className="block">Merkez{ADDRESS_LINES[1]}</span> : null}
                </address>
                <a href={MAP_HREF} {...ext} className={`mt-2 inline-block text-[0.95rem] font-semibold text-cream ${linkClass}`}>
                  Haritada aç
                </a>
              </dd>
            </div>

            <div>
              <dt className={labelClass}>E-posta</dt>
              <dd className="mt-2 text-[1.05rem] leading-[1.55] text-cream/90">
                <a href={`mailto:${COMPANY.emailOps}`} className={`font-semibold text-cream ${linkClass}`}>
                  {COMPANY.emailOps}
                </a>
                <p className="mt-1 text-[0.95rem] text-cream/70">{COMPANY.legalName}</p>
              </dd>
            </div>

            <div>
              <dt className={labelClass}>Sosyal medya</dt>
              <dd className="mt-3 flex flex-wrap gap-3">
                {SOCIALS.map((s) => {
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

      {/* Bant 2 — kimlik ve bağlantılar */}
      <div className="bg-moss/30">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Link href="/" className="inline-block" aria-label="Es Çay ana sayfa">
              <Image src="/logo.png" alt="Es Çay" width={180} height={96} className="h-14 w-auto" />
            </Link>
            <p className="mt-6 max-w-[32ch] text-[1rem] leading-[1.55] text-cream/80">
              Karadeniz’in yüksek rakımlı bahçelerinden, katkısız harmanlanan çay. Yapraktan bardağa.
            </p>
          </div>
          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7 lg:col-start-6">
            <LinkColumn title="Çaylar" links={SHOP_LINKS} />
            <LinkColumn title="Keşfet" links={DISCOVER_LINKS} />
            <LinkColumn title="Yardım" links={HELP_LINKS} />
          </div>
        </div>
      </div>

      {/* Bant 3 — yasal */}
      <div className="bg-moss/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-[0.85rem] text-cream/70 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>
            © {year} {COMPANY.legalName} Tüm hakları saklıdır.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href} className={linkClass}>
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
