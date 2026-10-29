import Image from "next/image"
import Link from "next/link"
import { socialIcon } from "@/components/brand/SocialIcons"
import { COMPANY } from "@/lib/company"
import { LEGAL_PAGES } from "@/lib/legal"
import { LANDING_LINKS } from "@/lib/site"
import { getStoreCategories } from "@/lib/store-categories"
import { CATEGORY_BASE, categoryPath } from "@/lib/urls"

const CORPORATE_LINKS = [
  { href: LANDING_LINKS.home, label: "Kurumsal site", landing: true },
  { href: LANDING_LINKS.about, label: "Hakkımızda", landing: true },
  { href: LANDING_LINKS.faq, label: "Sıkça sorulan sorular", landing: true },
  { href: LANDING_LINKS.contact, label: "İletişim", landing: true },
]

const HELP_LINKS = [
  { href: "/hesabim", label: "Hesabım" },
  { href: "/order-tracking", label: "Sipariş takibi" },
  { href: "/sepet", label: "Sepet" },
  { href: "/istek-listesi", label: "Favoriler" },
]

const SOCIALS = [
  { label: "Instagram", href: COMPANY.instagramUrl },
  { label: "Facebook", href: COMPANY.facebookUrl },
]

const MAP_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(COMPANY.address)}`
const ext = { target: "_blank", rel: "noopener noreferrer" } as const

type FooterLink = { href: string; label: string; external?: boolean; landing?: boolean }

function LinkColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title} className="site-footer__col">
      <h2 className="site-footer__heading">{title}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            {link.external ? (
              <a href={link.href} {...ext}>
                {link.label}
              </a>
            ) : link.landing ? (
              <a href={link.href}>{link.label}</a>
            ) : (
              <Link href={link.href}>{link.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export async function SiteFooter() {
  const year = new Date().getFullYear()
  const categories = await getStoreCategories()
  const shopLinks: FooterLink[] = [
    { href: CATEGORY_BASE, label: "Tüm ürünler" },
    ...categories.map((c) => ({ href: categoryPath(c.handle), label: c.name })),
  ]

  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__inner site-footer__top-row">
          <Link href="/" className="site-footer__logo" aria-label="Es Çay ana sayfa">
            <Image src="/logo.png" alt="Es Çay" width={150} height={80} />
          </Link>
          <dl className="site-footer__contact">
            <div>
              <dt>Müşteri hizmetleri</dt>
              <dd>
                <a href={COMPANY.phoneHref} className="site-footer__phone">
                  {COMPANY.phone}
                </a>
                <span>{COMPANY.hours}</span>
              </dd>
            </div>
            <div>
              <dt>E-posta</dt>
              <dd>
                <a href={`mailto:${COMPANY.emailOps}`}>{COMPANY.emailOps}</a>
              </dd>
            </div>
            <div>
              <dt>Fabrika</dt>
              <dd>
                <address>{COMPANY.address}</address>
                <a href={MAP_HREF} {...ext} className="site-footer__map">
                  Haritada aç
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="site-footer__inner site-footer__grid">
        <p className="site-footer__about">
          Hayrat / Trabzon’daki fabrikamızda, Doğu Karadeniz bahçelerinden gelen yaprağı katkısız harmanlıyoruz.
        </p>
        <LinkColumn title="Ürünler" links={shopLinks} />
        <LinkColumn title="Kurumsal" links={CORPORATE_LINKS} />
        <LinkColumn title="Yardım" links={HELP_LINKS} />
      </div>

      <div className="site-footer__bar">
        <div className="site-footer__inner site-footer__bar-row">
          <p>
            © {year} {COMPANY.legalName}
          </p>
          <ul className="site-footer__legal">
            {LEGAL_PAGES.map((page) => (
              <li key={page.href}>
                <Link href={page.href}>{page.title}</Link>
              </li>
            ))}
          </ul>
          <ul className="site-footer__social">
            {SOCIALS.map((s) => {
              const Icon = socialIcon(s.label)
              return (
                <li key={s.href}>
                  <a href={s.href} {...ext} aria-label={s.label} title={s.label}>
                    {Icon ? <Icon className="h-[18px] w-[18px]" /> : s.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </footer>
  )
}
