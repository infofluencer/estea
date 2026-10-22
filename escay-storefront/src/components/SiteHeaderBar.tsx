"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LoginPanel } from "@/components/auth/LoginPanel"
import { CartNavButton } from "@/components/CartNavButton"
import { FavoritesNavButton } from "@/components/FavoritesNavButton"
import { useHomeT } from "@/lib/copy"
import { formatTry } from "@/lib/medusa"
import { categoryPath, productPath } from "@/lib/urls"

/** Üst menü — kategori handle'ları backend seed'iyle aynı (siyah-cay, yesil-cay, bitki-cayi, harmanlar, hediye). */
const NAV_LINKS = [
  {
    fixed: "Çaylar",
    handle: "siyah-cay",
    children: [
      { label: "Siyah Çay", href: "/urun-kategori/siyah-cay" },
      { label: "Yeşil Çay", href: "/urun-kategori/yesil-cay" },
      { label: "Bitki Çayı", href: "/urun-kategori/bitki-cayi" },
    ],
  },
  { fixed: "Harmanlar", handle: "harmanlar" },
  { fixed: "Hediye", handle: "hediye" },
] as const

const SUBMENU_CLOSE_DELAY_MS = 180

function NavDropdown({
  label,
  href,
  items,
}: {
  label: string
  href: string
  items: readonly { label: string; href: string }[]
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number>(0)
  const touchRef = useRef(false)
  const menuId = `submenu-${href.replace(/\W+/g, "-")}`

  const show = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }, [])

  // Small grace period so the menu survives the pointer crossing the gap.
  const hideSoon = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), SUBMENU_CLOSE_DELAY_MS)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      setOpen(false)
      rootRef.current?.querySelector<HTMLElement>(".site-header__nav-label")?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`site-header__nav-item has-submenu${open ? " is-open" : ""}`}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") show()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") hideSoon()
      }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <Link
        href={href}
        className="site-header__nav-label"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onPointerDown={(e) => {
          touchRef.current = e.pointerType !== "mouse"
        }}
        onClick={(e) => {
          // Touch has no hover: first tap opens the menu, second tap navigates.
          if (touchRef.current && !open) {
            e.preventDefault()
            show()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            show()
            requestAnimationFrame(() =>
              rootRef.current
                ?.querySelector<HTMLElement>(".site-header__submenu a")
                ?.focus()
            )
          }
        }}
      >
        {label}
        <svg
          className="site-header__nav-caret"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <div
        id={menuId}
        className="site-header__submenu"
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
          e.preventDefault()
          const links = [
            ...(rootRef.current?.querySelectorAll<HTMLElement>(".site-header__submenu a") ?? []),
          ]
          const i = links.indexOf(document.activeElement as HTMLElement)
          const next = e.key === "ArrowDown" ? i + 1 : i - 1
          links[(next + links.length) % links.length]?.focus()
        }}
      >
        <ul className="site-header__submenu-list">
          {items.map((child) => (
            <li key={child.href}>
              <Link href={child.href} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
                <span>{child.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href={href}
          className="site-header__submenu-all"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
        >
          Tümünü gör
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden>
            <path
              d="M1 5h11M8.5 1.5 12 5 8.5 8.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>
    </div>
  )
}

type SearchHit = {
  id: string
  handle: string
  title: string
  thumbnail: string
  price: number | null
}

export function SiteHeaderBar({
  cartCount = 0,
  isLoggedIn = false,
}: {
  cartCount?: number
  isLoggedIn?: boolean
}) {
  return (
    <Suspense fallback={<SiteHeaderBarShell cartCount={cartCount} isLoggedIn={isLoggedIn} />}>
      <SiteHeaderBarInner cartCount={cartCount} isLoggedIn={isLoggedIn} />
    </Suspense>
  )
}

function SiteHeaderBarShell({
  cartCount = 0,
  isLoggedIn = false,
}: {
  cartCount?: number
  isLoggedIn?: boolean
}) {
  return (
    <SiteHeaderBarContent
      cartCount={cartCount}
      isLoggedIn={isLoggedIn}
      loginOpen={false}
      onLoginOpen={() => {}}
    />
  )
}

function SiteHeaderBarInner({
  cartCount = 0,
  isLoggedIn = false,
}: {
  cartCount?: number
  isLoggedIn?: boolean
}) {
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
      <SiteHeaderBarContent
        cartCount={cartCount}
        isLoggedIn={isLoggedIn}
        loginOpen={loginOpen}
        onLoginOpen={openLogin}
      />
      <LoginPanel
        open={loginOpen}
        initialMode={panelMode}
        onClose={closeLogin}
      />
    </>
  )
}

function SiteHeaderBarContent({
  cartCount = 0,
  isLoggedIn = false,
  loginOpen,
  onLoginOpen,
}: {
  cartCount?: number
  isLoggedIn?: boolean
  loginOpen: boolean
  onLoginOpen: () => void
}) {
  const pathname = usePathname()
  const tx = useHomeT()
  const [hovered, setHovered] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [touchReveal, setTouchReveal] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchFormRef = useRef<HTMLFormElement>(null)
  const scrolledRef = useRef(false)
  const revealTimer = useRef<number>(0)
  const isHome = pathname === "/"
  const isOverlayPage = isHome
  const compact = scrolled
  const useHamburger = isMobile

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY
      // Hysteresis: avoid flicker / layout thrash near the threshold
      const next = scrolledRef.current ? y > 24 : y > 64
      if (next === scrolledRef.current) return
      scrolledRef.current = next
      setScrolled(next)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [pathname])

  useEffect(() => {
    setMenuOpen(false)
    setOpenGroup(null)
    setTouchReveal(false)
    window.clearTimeout(revealTimer.current)
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

  useEffect(() => {
    if (useHamburger) return
    setMenuOpen(false)
    setOpenGroup(null)
  }, [useHamburger])

  useEffect(() => {
    return () => window.clearTimeout(revealTimer.current)
  }, [])

  useEffect(() => {
    const top = document.querySelector(".site-top")
    if (!top) return
    // Overlay pages: chrome is absolute — pin navbar after scroll.
    // Other pages: CSS sticky (display:contents on .site-chrome).
    top.classList.toggle("is-pinned", isOverlayPage && scrolled)
    return () => top.classList.remove("is-pinned")
  }, [isOverlayPage, scrolled])

  useEffect(() => {
    const node = document.querySelector(".site-top")
    if (!(node instanceof HTMLElement)) return
    const chrome: HTMLElement = node

    function syncHeight() {
      document.documentElement.style.setProperty(
        "--site-header-h",
        `${chrome.offsetHeight}px`
      )
    }

    syncHeight()
    const ro = new ResizeObserver(syncHeight)
    ro.observe(chrome)
    return () => ro.disconnect()
  }, [pathname, scrolled, searchOpen, menuOpen, useHamburger])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!searchOpen) return

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null
      if (target && searchFormRef.current?.contains(target)) return
      setSearchOpen(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSearchOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [searchOpen])

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

  const searchBusy =
    searchOpen || searchFocused || query.trim().length > 0
  const hoverSolid = isMobile ? touchReveal : hovered
  const solid =
    !isOverlayPage || hoverSolid || searchBusy || scrolled || menuOpen
  const showResults =
    query.trim().length >= 2 && (searching || hits.length > 0 || !searching)

  function revealForFiveSeconds() {
    if (!isMobile || !isOverlayPage || compact) return
    setTouchReveal(true)
    window.clearTimeout(revealTimer.current)
    revealTimer.current = window.setTimeout(() => {
      setTouchReveal(false)
    }, 5000)
  }

  const profileIcon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.5c1.6-3.2 4-4.8 6.5-4.8s4.9 1.6 6.5 4.8" />
    </svg>
  )

  function closeMenu() {
    setMenuOpen(false)
    setOpenGroup(null)
  }

  return (
    <>
    <header
      className={[
        "site-header",
        solid ? "is-solid" : "is-clear",
        compact ? "is-compact" : "",
        searchOpen ? "is-search-open" : "",
        useHamburger ? "is-hamburger" : "",
        menuOpen ? "is-menu-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={() => {
        if (!isMobile) setHovered(true)
      }}
      onMouseLeave={() => {
        if (!isMobile) setHovered(false)
      }}
      onPointerDown={() => revealForFiveSeconds()}
    >
      <Link href="/" className="site-logo site-header__brand" aria-label="Es Çay">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Es Çay" className="site-logo__img" />
      </Link>

      <form
        ref={searchFormRef}
        className="site-header__search"
        action="/search"
        method="get"
        onSubmit={(event) => {
          const q = query.trim()
          if (q.length < 2) {
            event.preventDefault()
            return
          }
          setSearchOpen(false)
        }}
      >
        <label className="sr-only" htmlFor="site-search">
          {tx("search")}
        </label>
        <button
          type="button"
          data-testid="search-button"
          className="site-header__search-toggle"
          aria-label={searchOpen ? tx("searchClose") : tx("search")}
          aria-expanded={searchOpen}
          title={tx("search")}
          onClick={() => setSearchOpen((open) => !open)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
        <div className="site-header__search-panel">
          <span className="site-header__search-icon" aria-hidden>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </span>
          <input
            ref={searchRef}
            id="site-search"
            data-testid="search-input"
            name="q"
            type="search"
            placeholder={tx("searchPlaceholder")}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              setSearchFocused(true)
            }}
            onBlur={() => {
              window.setTimeout(() => {
                const active = document.activeElement
                if (active && searchFormRef.current?.contains(active)) return
                setSearchFocused(false)
              }, 120)
            }}
          />
          <button
            type="button"
            className="site-header__search-close"
            aria-label={tx("searchClose")}
            title={tx("searchClose")}
            onClick={() => {
              setSearchOpen(false)
              setQuery("")
              setSearchFocused(false)
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>

          {showResults ? (
            <div className="site-header__search-results" role="listbox">
              {searching && hits.length === 0 ? (
                <p className="site-header__search-empty">{tx("searching")}</p>
              ) : null}
              {!searching && hits.length === 0 ? (
                <p className="site-header__search-empty">{tx("searchEmpty")}</p>
              ) : null}
              {hits.map((hit) => (
                <Link
                  key={hit.id}
                  href={`${productPath(hit.handle)}`}
                  className="site-header__search-hit"
                  role="option"
                  onClick={() => {
                    setSearchOpen(false)
                    setQuery("")
                    setHits([])
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={hit.thumbnail}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                  />
                  <span className="site-header__search-hit-copy">
                    <span className="site-header__search-hit-title">
                      {hit.title}
                    </span>
                    {hit.price != null ? (
                      <span className="site-header__search-hit-price">
                        {formatTry(hit.price)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
              {!searching && hits.length > 0 && query.trim().length >= 2 ? (
                <Link
                  href={`/search?q=${encodeURIComponent(query.trim())}`}
                  className="site-header__search-hit"
                  onClick={() => setSearchOpen(false)}
                >
                  <span className="site-header__search-hit-copy">
                    <span className="site-header__search-hit-title">
                      Tüm sonuçları gör
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>

      <nav className="site-header__nav" aria-label={tx("navMain")}>
        {NAV_LINKS.map((item) => {
          const label = item.fixed

          if ("children" in item && item.children) {
            return (
              <NavDropdown
                key={item.handle}
                label={label}
                href={`${categoryPath(item.handle)}`}
                items={item.children}
              />
            )
          }

          return (
            <Link
              key={item.handle}
              href={`${categoryPath(item.handle)}`}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="site-header__actions">
        <FavoritesNavButton />
        {!useHamburger ? (
          isLoggedIn ? (
            <Link
              href="/hesabim"
              className="site-header__action"
              aria-label={tx("profile")}
              title={tx("profile")}
            >
              <svg
                width="20"
                height="20"
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
            </Link>
          ) : (
            <button
              type="button"
              className="site-header__action"
              aria-label={tx("profile")}
              title={tx("profile")}
              aria-expanded={loginOpen}
              style={{
                border: 0,
                background: "transparent",
                padding: 0,
                cursor: "pointer",
              }}
              onClick={onLoginOpen}
            >
              <svg
                width="20"
                height="20"
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
            </button>
          )
        ) : null}
        <CartNavButton initialCount={cartCount} />
        {useHamburger ? (
          <button
            type="button"
            className="site-header__menu-toggle"
            aria-label={menuOpen ? tx("navMenuClose") : tx("navMenu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        ) : null}
      </div>
    </header>

    {useHamburger && menuOpen ? (
      <div className="site-nav-drawer" role="dialog" aria-modal="true" aria-label={tx("navMain")}>
        <div className="site-nav-drawer__panel">
          <div className="site-nav-drawer__top">
            <Link href="/" className="site-nav-drawer__brand" aria-label="Es Çay" onClick={closeMenu}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Es Çay" />
            </Link>
            <button
              type="button"
              className="site-nav-drawer__close"
              aria-label={tx("navMenuClose")}
              onClick={closeMenu}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 5l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M19 5L5 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <form
            className="site-nav-drawer__search"
            action="/search"
            method="get"
            role="search"
            onSubmit={(event) => {
              const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement | null
              if (!input || input.value.trim().length < 2) {
                event.preventDefault()
                return
              }
              closeMenu()
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              name="q"
              type="search"
              placeholder={tx("searchPlaceholder")}
              aria-label={tx("search")}
              autoComplete="off"
              enterKeyHint="search"
            />
          </form>

          <nav className="site-nav-drawer__nav">
            {NAV_LINKS.map((item) => {
              const label = item.fixed

              if ("children" in item && item.children) {
                const expanded = openGroup === item.handle
                return (
                  <div
                    key={item.handle}
                    className={`site-nav-drawer__group${expanded ? " is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className="site-nav-drawer__group-btn"
                      aria-expanded={expanded}
                      onClick={() =>
                        setOpenGroup((current) =>
                          current === item.handle ? null : item.handle
                        )
                      }
                    >
                      <span>{label}</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path
                          d="M2.5 4.5L6 8l3.5-3.5"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {expanded ? (
                      <div className="site-nav-drawer__sub">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={closeMenu}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              }

              return (
                <Link
                  key={item.handle}
                  href={`${categoryPath(item.handle)}`}
                  className="site-nav-drawer__link"
                  onClick={closeMenu}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="site-nav-drawer__footer">
            {isLoggedIn ? (
              <Link
                href="/hesabim"
                className="site-nav-drawer__profile"
                onClick={closeMenu}
              >
                {profileIcon}
                {tx("profile")}
              </Link>
            ) : (
              <button
                type="button"
                className="site-nav-drawer__profile"
                onClick={() => {
                  closeMenu()
                  onLoginOpen()
                }}
              >
                {profileIcon}
                {tx("profile")}
              </button>
            )}
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
