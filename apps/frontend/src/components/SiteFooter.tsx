"use client"

import Link from "next/link"
import { useState, useSyncExternalStore } from "react"
import { useHomeT } from "@/lib/copy"
import { COMPANY } from "@/lib/company"
import { LEGAL_PAGES } from "@/lib/legal"
import { categoryPath } from "@/lib/urls"

const INSTAGRAM_URL = COMPANY.instagramUrl
const FACEBOOK_URL = COMPANY.facebookUrl

/** Kategori handle'ları backend seed'iyle aynı. */
const FOOTER_SHOP = [
  { handle: "siyah-cay", fixed: "Siyah Çay" },
  { handle: "yesil-cay", fixed: "Yeşil Çay" },
  { handle: "bitki-cayi", fixed: "Bitki Çayı" },
  { handle: "harmanlar", fixed: "Harmanlar" },
  { handle: "hediye", fixed: "Hediye" },
] as const

const FOOTER_DISCOVER = [
  { href: "/hakkimizda", label: "Hakkımızda" },
  { href: `${COMPANY.corporateSite}/cayin-yolculugu/`, label: "Çayın Yolculuğu" },
  { href: `${COMPANY.corporateSite}/blog/`, label: "Blog" },
  { href: "/faq", label: "SSS" },
] as const

/** Below this width the link columns collapse into accordions. */
const COMPACT_QUERY = "(max-width: 640px)"

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function SiteFooter() {
  const tx = useHomeT()
  const isCompact = useMediaQuery(COMPACT_QUERY)
  const [openSection, setOpenSection] = useState<string | null>(null)

  const shopLinks = FOOTER_SHOP.map((item) => ({
    href: `${categoryPath(item.handle)}`,
    label: item.fixed,
  }))

  const sections = [
    { id: "categories", title: tx("footerCategories"), links: shopLinks },
    { id: "discover", title: tx("footerCollections"), links: [...FOOTER_DISCOVER] },
    {
      id: "help",
      title: tx("footerHelp"),
      links: [
        { href: "/sepet", label: tx("footerCart") },
        { href: "/istek-listesi", label: tx("footerFavorites") },
        { href: "/order-tracking", label: "Sipariş takibi" },
        { href: "/odeme", label: tx("footerCheckout") },
        { href: "/faq", label: "SSS" },
        { href: "/hakkimizda", label: "Hakkımızda" },
        { href: "/iletisim", label: tx("footerContact") },
      ],
    },
  ]

  return (
    <>
      <form className="site-login-bar" action="/hesabim" method="get">
        <p className="site-login-bar__title">{tx("footerLoginLead")}</p>
        <div className="site-login-bar__fields">
          <label className="sr-only" htmlFor="footer-login-email">
            {tx("footerEmail")}
          </label>
          <input
            id="footer-login-email"
            className="site-login-bar__email"
            type="email"
            name="email"
            placeholder={tx("footerEmailPh")}
            autoComplete="email"
          />
          <button type="submit" className="site-login-bar__btn">
            {tx("footerLogin")}
          </button>
        </div>
      </form>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand">
            <Link href="/" className="site-footer__logo">
              Es Çay
            </Link>
            <span className="site-footer__rule" aria-hidden />
            <p className="site-footer__tagline">
              {tx("footerTagline")}
              <strong className="site-footer__signature">
                {tx("footerSignature")}
              </strong>
            </p>
            <div className="site-footer__social">
              <a
                href={INSTAGRAM_URL}
                className="site-footer__social-link"
                aria-label="Instagram"
                title="Instagram"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle
                    cx="17.5"
                    cy="6.5"
                    r="1"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              </a>
              <a
                href={FACEBOOK_URL}
                className="site-footer__social-link"
                aria-label="Facebook"
                title="Facebook"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M13.5 22v-8.2h2.8l.4-3.3h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.3h2.8V22h3.4z" />
                </svg>
              </a>
            </div>
          </div>

          {sections.map((section) => {
            const isOpen = !isCompact || openSection === section.id
            const listId = `site-footer-${section.id}`
            return (
              <nav
                key={section.id}
                className={`site-footer__nav${isOpen ? " is-open" : ""}`}
                aria-label={section.title}
              >
                {isCompact ? (
                  <h2 className="site-footer__heading">
                    <button
                      type="button"
                      className="site-footer__toggle"
                      aria-expanded={isOpen}
                      aria-controls={listId}
                      onClick={() =>
                        setOpenSection(isOpen ? null : section.id)
                      }
                    >
                      <span>{section.title}</span>
                      <span className="site-footer__toggle-icon" aria-hidden />
                    </button>
                  </h2>
                ) : (
                  <h2 className="site-footer__heading">{section.title}</h2>
                )}
                <ul id={listId} hidden={!isOpen}>
                  {section.links.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )
          })}
        </div>

        <div className="site-footer__bottom">
          <div className="site-footer__bottom-inner">
            <p className="site-footer__copy">
              © {new Date().getFullYear()} {COMPANY.legalName}. {tx("footerRights")}
            </p>
            <nav className="site-footer__legal" aria-label="Yasal">
              <ul>
                {LEGAL_PAGES.map((page) => (
                  <li key={page.href}>
                    <Link href={page.href}>{page.title}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </footer>
    </>
  )
}
