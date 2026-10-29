"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LoginPanel } from "@/components/auth/LoginPanel"
import { CartNavButton } from "@/components/CartNavButton"
import { FavoritesNavButton } from "@/components/FavoritesNavButton"
import { COMPANY } from "@/lib/company"
import { useHomeT } from "@/lib/copy"
import { formatTry } from "@/lib/medusa"
import { LANDING_LINKS } from "@/lib/site"
import { CATEGORY_BASE, categoryPath, productPath } from "@/lib/urls"

export type NavCategory = { handle: string; name: string }

/** Kategori satırının sağındaki kurumsal bağlantılar. */
const CORPORATE_LINKS = [
  { label: "Hakkımızda", href: LANDING_LINKS.about },
  { label: "Sıkça sorulanlar", href: LANDING_LINKS.faq },
  { label: "İletişim", href: LANDING_LINKS.contact },
] as const

const PHONE = { label: COMPANY.phone, href: COMPANY.phoneHref }

type SearchHit = {
  id: string
  handle: string
  title: string
  thumbnail: string
  price: number | null
}

type BarProps = {
  cartCount?: number
  isLoggedIn?: boolean
  categories?: NavCategory[]
}

export function SiteHeaderBar(props: BarProps) {
  return (
    <Suspense
      fallback={<SiteHeaderBarContent {...props} loginOpen={false} onLoginOpen={() => {}} />}
    >
      <SiteHeaderBarInner {...props} />
    </Suspense>
  )
}

function SiteHeaderBarInner(props: BarProps) {
  const { isLoggedIn = false } = props
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loginOpen, setLoginOpen] = useState(false)
  const [panelMode, setPanelMode] = useState<"login" | "register">("login")
  const closeLogin = useCallback(() => setLoginOpen(false), [])
  const openLogin = useCallback(() => {
    setPanelMode("login")
    setLoginOpen(true)
  }, [])

  useEffect(() => {
    if (isLoggedIn) return

    const wantsLogin = searchParams.get("login") === "1"
    const wantsRegister = searchParams.get("register") === "1"
    if (!wantsLogin && !wantsRegister) return

    setPanelMode(wantsRegister ? "register" : "login")
    setLoginOpen(true)

    const next = new URLSearchParams(searchParams.toString())
    next.delete("login")
    next.delete("register")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, isLoggedIn, pathname, router])

  return (
    <>
      <SiteHeaderBarContent {...props} loginOpen={loginOpen} onLoginOpen={openLogin} />
      <LoginPanel open={loginOpen} initialMode={panelMode} onClose={closeLogin} />
    </>
  )
}

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  )
}

function ProfileIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.5c1.6-3.2 4-4.8 6.5-4.8s4.9 1.6 6.5 4.8" />
    </svg>
  )
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SiteHeaderBarContent({
  cartCount = 0,
  isLoggedIn = false,
  categories = [],
  loginOpen,
  onLoginOpen,
}: BarProps & {
  loginOpen: boolean
  onLoginOpen: () => void
}) {
  const pathname = usePathname()
  const tx = useHomeT()
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [resultsOpen, setResultsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [navRevealed, setNavRevealed] = useState(false)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setMenuOpen(false)
    setResultsOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  // Tam header ekrandan çıkınca kompakt satır yukarıya sabitlenir; kategori menüsü yalnız
  // yukarı kaydırınca iner. Yuva tam yüksekliği tutar ki geçişte sayfa zıplamasın.
  useEffect(() => {
    const header = headerRef.current
    const slot = header?.parentElement
    if (!header || !slot) return
    const bar: HTMLElement = header
    const holder: HTMLElement = slot
    let fullHeight = bar.offsetHeight
    let compactNow = false
    let lastY = window.scrollY
    let frame = 0

    function measure() {
      if (compactNow) return
      fullHeight = bar.offsetHeight
      holder.style.height = `${fullHeight}px`
    }

    function update() {
      frame = 0
      const y = window.scrollY
      const next = y > fullHeight
      if (next !== compactNow) {
        compactNow = next
        setCompact(next)
        setNavRevealed(false)
        lastY = y
        return
      }
      if (next && Math.abs(y - lastY) > 8) {
        setNavRevealed(y < lastY)
        lastY = y
      }
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    measure()
    update()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      holder.style.height = ""
    }
  }, [])

  useEffect(() => {
    if (!resultsOpen) return
    function onPointerDown(event: PointerEvent) {
      if (!searchFormRef.current?.contains(event.target as Node)) setResultsOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setResultsOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [resultsOpen])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        const data = (await res.json()) as { products?: SearchHit[] }
        setHits(data.products || [])
      } catch {
        setHits([])
      } finally {
        setSearching(false)
      }
    }, 220)

    return () => window.clearTimeout(timer)
  }, [query])

  const showResults = resultsOpen && query.trim().length >= 2

  function clearSearch() {
    setResultsOpen(false)
    setQuery("")
    setHits([])
  }

  return (
    <>
      <header
        ref={headerRef}
        className={[
          "site-header",
          menuOpen ? "is-menu-open" : "",
          compact ? "is-compact" : "",
          compact && navRevealed ? "is-nav-revealed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="site-header__strip">
          <div className="site-header__inner">
            <p className="site-header__strip-note">
              Hayrat / Trabzon’daki fabrikamızdan doğrudan kapınıza
            </p>
            <ul className="site-header__strip-links">
              <li>
                <a href={PHONE.href}>{PHONE.label}</a>
              </li>
              <li>
                <Link href="/order-tracking">Sipariş takibi</Link>
              </li>
              <li>
                <a href={LANDING_LINKS.contact}>İletişim</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="site-header__main">
          <div className="site-header__inner">
            <button
              type="button"
              className="site-header__menu-toggle"
              aria-label={menuOpen ? tx("navMenuClose") : tx("navMenu")}
              aria-expanded={menuOpen}
              aria-controls="site-nav-drawer"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                )}
              </svg>
            </button>

            <Link href="/" className="site-logo site-header__brand" aria-label="Es Çay ana sayfa">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Es Çay" className="site-logo__img" width={341} height={182} />
            </Link>

            <form
              ref={searchFormRef}
              className="site-header__search"
              action="/search"
              method="get"
              role="search"
              onSubmit={(event) => {
                if (query.trim().length < 2) {
                  event.preventDefault()
                  return
                }
                setResultsOpen(false)
              }}
            >
              <label className="sr-only" htmlFor="site-search">
                {tx("search")}
              </label>
              <input
                id="site-search"
                data-testid="search-input"
                name="q"
                type="search"
                placeholder="Çay, bitki çayı veya ürün ara"
                autoComplete="off"
                enterKeyHint="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setResultsOpen(true)
                }}
                onFocus={() => setResultsOpen(true)}
              />
              <button
                type="submit"
                className="site-header__search-submit"
                data-testid="search-button"
                aria-label={tx("search")}
              >
                <SearchIcon />
              </button>

              {showResults ? (
                <div className="site-header__search-results" role="listbox" aria-label="Arama sonuçları">
                  {searching && hits.length === 0 ? (
                    <p className="site-header__search-empty">{tx("searching")}</p>
                  ) : null}
                  {!searching && hits.length === 0 ? (
                    <p className="site-header__search-empty">{tx("searchEmpty")}</p>
                  ) : null}
                  {hits.map((hit) => (
                    <Link
                      key={hit.id}
                      href={productPath(hit.handle)}
                      className="site-header__search-hit"
                      role="option"
                      aria-selected={false}
                      onClick={clearSearch}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={hit.thumbnail} alt="" width={48} height={48} loading="lazy" />
                      <span className="site-header__search-hit-copy">
                        <span className="site-header__search-hit-title">{hit.title}</span>
                        {hit.price != null ? (
                          <span className="site-header__search-hit-price">{formatTry(hit.price)}</span>
                        ) : null}
                      </span>
                    </Link>
                  ))}
                  {!searching && hits.length > 0 ? (
                    <Link
                      href={`/search?q=${encodeURIComponent(query.trim())}`}
                      className="site-header__search-all"
                      onClick={() => setResultsOpen(false)}
                    >
                      Tüm sonuçları gör
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </form>

            <div className="site-header__actions">
              <div className="site-header__pop site-header__pop--account">
                {isLoggedIn ? (
                  <Link href="/hesabim" className="site-header__action" title="Hesabım">
                    <span className="site-header__icon">
                      <ProfileIcon />
                    </span>
                    <span className="site-header__action-label">Hesabım</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="site-header__action"
                    aria-expanded={loginOpen}
                    title="Giriş yap"
                    onClick={onLoginOpen}
                  >
                    <span className="site-header__icon">
                      <ProfileIcon />
                    </span>
                    <span className="site-header__action-label">Giriş yap</span>
                  </button>
                )}
              </div>
              <FavoritesNavButton />
              <CartNavButton initialCount={cartCount} />
            </div>
          </div>
        </div>

        <nav className="site-header__nav" aria-label={tx("navMain")}>
          <div className="site-header__inner">
            <ul className="site-header__cats">
              <li>
                <Link
                  href={CATEGORY_BASE}
                  className="site-header__cat"
                  aria-current={pathname === CATEGORY_BASE ? "page" : undefined}
                >
                  Tüm ürünler
                </Link>
              </li>
              {categories.map((c) => {
                const href = categoryPath(c.handle)
                return (
                  <li key={c.handle}>
                    <Link
                      href={href}
                      className="site-header__cat"
                      aria-current={isActive(pathname, href) ? "page" : undefined}
                    >
                      {c.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
            <ul className="site-header__corp">
              {CORPORATE_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
              <li>
                <a href={LANDING_LINKS.home} className="site-header__corp-site">
                  esteacay.com
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </header>

      {menuOpen ? (
        <div className="site-nav-drawer" id="site-nav-drawer" role="dialog" aria-modal="true" aria-label={tx("navMain")}>
          <button
            type="button"
            className="site-nav-drawer__scrim"
            aria-label={tx("navMenuClose")}
            onClick={() => setMenuOpen(false)}
          />
          <div className="site-nav-drawer__panel">
            <div className="site-nav-drawer__top">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Es Çay" width={341} height={182} />
              <button
                type="button"
                className="site-nav-drawer__close"
                aria-label={tx("navMenuClose")}
                onClick={() => setMenuOpen(false)}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="site-nav-drawer__nav" aria-label="Kategoriler">
              <Link href={CATEGORY_BASE} className="site-nav-drawer__link">
                Tüm ürünler
              </Link>
              {categories.map((c) => (
                <Link key={c.handle} href={categoryPath(c.handle)} className="site-nav-drawer__link">
                  {c.name}
                </Link>
              ))}
            </nav>

            <nav className="site-nav-drawer__secondary" aria-label="Kurumsal">
              {CORPORATE_LINKS.map((l) => (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              ))}
              <a href={LANDING_LINKS.home}>Kurumsal site (esteacay.com)</a>
              <Link href="/order-tracking">Sipariş takibi</Link>
              {isLoggedIn ? (
                <Link href="/hesabim">Hesabım</Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onLoginOpen()
                  }}
                >
                  Giriş yap / Üye ol
                </button>
              )}
            </nav>

            <a className="site-nav-drawer__phone" href={PHONE.href}>
              {PHONE.label}
            </a>
          </div>
        </div>
      ) : null}
    </>
  )
}
