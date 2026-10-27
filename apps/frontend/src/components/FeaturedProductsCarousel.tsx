"use client"

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
  type TransitionEvent,
} from "react"
import Link from "next/link"
import { useFavorites } from "@/components/FavoritesProvider"
import { SoldOutStamp } from "@/components/SoldOutStamp"
import { addToCartAction } from "@/lib/actions"
import { countCartItems, notifyCartAdded, notifyCartCount } from "@/lib/cart-events"
import { formatTry } from "@/lib/medusa"
import { productPath } from "@/lib/urls"

export type FeaturedProduct = {
  id: string
  handle: string
  title: string
  variantId?: string | null
  thumbnail?: string | null
  image?: string | null
  hoverImage?: string | null
  /** Primary + second angle for hover (when available). */
  images?: string[] | null
  price?: number | null
  originalPrice?: number | null
  soldOut?: boolean
}

function resolveGallery(product: FeaturedProduct): string[] {
  if (product.images?.length) {
    return [...new Set(product.images.filter(Boolean))]
  }

  const raw = [product.image, product.hoverImage, product.thumbnail].filter(
    (src): src is string => Boolean(src)
  )

  return [...new Set(raw)]
}

function useVisibleCount(desktopVisible: number) {
  const [visible, setVisible] = useState(desktopVisible)

  useEffect(() => {
    function update() {
      const w = window.innerWidth
      if (w <= 600) setVisible(Math.min(2, desktopVisible))
      else if (w <= 980) setVisible(Math.min(3, desktopVisible))
      else setVisible(desktopVisible)
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [desktopVisible])

  return visible
}

function featuredProductHref(product: FeaturedProduct) {
  return product.variantId
    ? `${productPath(product.handle)}?v=${encodeURIComponent(product.variantId)}`
    : `${productPath(product.handle)}`
}

function FeaturedCard({ product }: { product: FeaturedProduct }) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const favoriteId = product.variantId || product.id
  const favorited = isFavorite(favoriteId)
  const productHref = featuredProductHref(product)
  const [pending, start] = useTransition()
  const [cartError, setCartError] = useState<string | null>(null)
  const primary =
    product.image || product.thumbnail || resolveGallery(product)[0] || ""
  const hover =
    product.hoverImage && product.hoverImage !== primary
      ? product.hoverImage
      : resolveGallery(product).find((src) => src !== primary) || null
  // Track by src so a changed hover image starts over.
  const [hoverLoaded, setHoverLoaded] = useState<string | null>(null)
  const [hoverFailed, setHoverFailed] = useState<string | null>(null)
  const soldOut = Boolean(product.soldOut)
  const canQuickAdd = !soldOut && Boolean(product.variantId)

  const onSale =
    product.originalPrice != null &&
    product.price != null &&
    Number(product.originalPrice) > Number(product.price)

  function onToggleFavorite(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite({
      id: favoriteId,
      handle: product.handle,
      title: product.title,
      price: product.price,
      image: primary || product.image || product.thumbnail,
      variantId: product.variantId ?? null,
    })
  }

  function onQuickAdd(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!product.variantId || pending) return
    start(async () => {
      setCartError(null)
      const result = await addToCartAction(product.variantId!)
      if (!result.ok) {
        setCartError(result.message)
        return
      }
      notifyCartCount(countCartItems(result.cart))
      notifyCartAdded(
        {
          title: product.title,
          image: primary || product.image || product.thumbnail,
          price: product.price,
        },
        { cart: result.cart, variantId: product.variantId, handle: product.handle }
      )
    })
  }

  return (
    <article className={`featured__card${soldOut ? " is-sold-out" : ""}`}>
      <div className="featured__media">
        <Link
          href={productHref}
          className="featured__media-link"
          aria-label={soldOut ? `${product.title} — Tükendi` : product.title}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={primary} alt="" className="featured__photo" />
          {hover && hoverFailed !== hover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hover}
              alt=""
              className={`featured__photo featured__photo--hover${hoverLoaded === hover ? " is-loaded" : ""}`}
              ref={(el) => {
                // Already cached before hydration: onLoad won't fire.
                if (el?.complete && el.naturalWidth > 0) setHoverLoaded(hover)
              }}
              onLoad={() => setHoverLoaded(hover)}
              onError={() => setHoverFailed(hover)}
              aria-hidden
            />
          ) : null}
          {soldOut ? <SoldOutStamp /> : null}
        </Link>

        {!soldOut ? <div className="featured__veil" aria-hidden /> : null}

        {canQuickAdd ? (
          <button
            type="button"
            className="featured__quick-add"
            onClick={onQuickAdd}
            disabled={pending}
          >
            {pending ? "Ekleniyor…" : "Sepete Ekle"}
          </button>
        ) : null}

        {cartError ? (
          <p className="featured__quick-add-error" role="alert">
            {cartError}
          </p>
        ) : null}

        <button
          type="button"
          data-testid="favorite-toggle"
          className={`featured__fav${favorited ? " is-active" : ""}`}
          onClick={onToggleFavorite}
          aria-label={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
          title={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill={favorited ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      <Link href={productHref} className="featured__meta">
        <h3 className="featured__name">{product.title}</h3>
        <div className="featured__price">
          <span>{formatTry(product.price)}</span>
          {onSale ? (
            <span className="featured__price-old">
              {formatTry(product.originalPrice)}
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  )
}

export function FeaturedProductsCarousel({
  products,
  title = "Öne çıkan ürünler",
  desktopVisible = 5,
  sideArrows = false,
  autoPlay = false,
  prevLabel = "Önceki ürünler",
  nextLabel = "Sonraki ürünler",
}: {
  products: FeaturedProduct[]
  title?: string
  desktopVisible?: number
  sideArrows?: boolean
  autoPlay?: boolean
  prevLabel?: string
  nextLabel?: string
}) {
  const visible = useVisibleCount(desktopVisible)
  const n = products.length
  const canSlide = n > visible
  const looped = canSlide
    ? autoPlay
      ? [...products, ...products]
      : [...products, ...products, ...products]
    : products
  const [index, setIndex] = useState(canSlide ? n : 0)
  const [instant, setInstant] = useState(false)
  const [paused, setPaused] = useState(false)
  const [photoHeight, setPhotoHeight] = useState<number | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLUListElement>(null)
  const offsetRef = useRef(0)
  const pausedRef = useRef(false)
  const indexRef = useRef(index)
  const skipClickRef = useRef(false)
  const pausedTimerRef = useRef(0)

  indexRef.current = index

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    offsetRef.current = 0
    const track = trackRef.current
    if (track && autoPlay && canSlide) {
      track.style.transition = "none"
      track.style.transform = "translateX(0)"
    }
    if (!autoPlay) {
      setInstant(true)
      setIndex(canSlide ? n : 0)
    }
  }, [visible, n, canSlide, autoPlay])

  useEffect(() => {
    if (!instant) return
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setInstant(false))
    })
    return () => window.cancelAnimationFrame(id)
  }, [instant])

  useEffect(() => {
    if (!sideArrows) return
    const stage = stageRef.current
    if (!stage) return

    function measure() {
      const medias = stageRef.current?.querySelectorAll<HTMLElement>(
        ".featured__media"
      )
      if (!medias?.length) return
      let max = 0
      medias.forEach((el) => {
        max = Math.max(max, el.offsetHeight)
      })
      if (max) setPhotoHeight(max)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    stage.querySelectorAll(".featured__media").forEach((el) => ro.observe(el))
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [sideArrows, products.length, visible])

  useEffect(() => {
    if (!autoPlay || !canSlide) return

    const SPEED = 22
    let rafId = 0
    let last = performance.now()

    function tick(now: number) {
      const track = trackRef.current
      if (track && !pausedRef.current) {
        const item = track.querySelector<HTMLElement>(".featured__item")
        const itemWidth = item?.offsetWidth ?? 0
        const setWidth = itemWidth * n

        if (setWidth > 0) {
          const dt = (now - last) / 1000
          offsetRef.current += SPEED * dt
          if (offsetRef.current >= setWidth) {
            offsetRef.current -= setWidth
          }
          track.style.transition = "none"
          track.style.transform = `translateX(-${offsetRef.current}px)`
        }
      }

      last = now
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [autoPlay, canSlide, n, visible])

  function snapIfNeeded(from: number) {
    if (!canSlide) return from
    if (from >= n * 2) return from - n
    if (from < n) return from + n
    return from
  }

  function onTrackTransitionEnd(event: TransitionEvent<HTMLUListElement>) {
    if (event.propertyName !== "transform" || !canSlide) return
    const next = snapIfNeeded(index)
    if (next === index) return
    setInstant(true)
    setIndex(next)
  }

  function step(delta: number) {
    if (!canSlide) return

    if (autoPlay) {
      const track = trackRef.current
      if (!track) return
      const item = track.querySelector<HTMLElement>(".featured__item")
      const itemWidth = item?.offsetWidth ?? 0
      const setWidth = itemWidth * n
      if (!setWidth) return

      offsetRef.current =
        (offsetRef.current + delta * itemWidth + setWidth) % setWidth
      track.style.transition = "transform 0.45s ease"
      track.style.transform = `translateX(-${offsetRef.current}px)`
      const onEnd = () => {
        track.style.transition = "none"
        track.removeEventListener("transitionend", onEnd)
      }
      track.addEventListener("transitionend", onEnd)
      return
    }

    setInstant(false)
    setIndex((i) => i + delta)
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el || !canSlide) return

    let startX = 0
    let startY = 0
    let lastX = 0
    let axis: "x" | "y" | null = null
    let tracking = false
    let startOffset = 0
    let startIndex = 0

    function pauseForSwipe() {
      window.clearTimeout(pausedTimerRef.current)
      setPaused(true)
    }

    function resumeSoon() {
      window.clearTimeout(pausedTimerRef.current)
      pausedTimerRef.current = window.setTimeout(() => setPaused(false), 1800)
    }

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      tracking = true
      axis = null
      startX = lastX = t.clientX
      startY = t.clientY
      startOffset = offsetRef.current
      startIndex = indexRef.current
      pauseForSwipe()
    }

    function onMove(e: TouchEvent) {
      if (!tracking) return
      const t = e.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
        if (axis === "y") return
      }
      if (axis !== "x") return
      e.preventDefault()
      lastX = t.clientX
      const track = trackRef.current
      if (!track) return
      track.style.transition = "none"
      if (autoPlay) {
        const item = track.querySelector<HTMLElement>(".featured__item")
        const w = item?.offsetWidth ?? 0
        const setWidth = w * n
        if (!setWidth) return
        let x = startOffset - dx
        x = ((x % setWidth) + setWidth) % setWidth
        track.style.transform = `translateX(-${x}px)`
        return
      }
      const count = Math.max(looped.length, 1)
      track.style.transform = `translateX(calc(-${(startIndex / count) * 100}% + ${dx}px))`
    }

    function onEnd() {
      if (!tracking) return
      tracking = false
      const dx = lastX - startX
      const track = trackRef.current
      if (axis === "x" && Math.abs(dx) > 40) {
        skipClickRef.current = true
        if (autoPlay && track) {
          const item = track.querySelector<HTMLElement>(".featured__item")
          const w = item?.offsetWidth ?? 1
          const setWidth = w * n
          let x = startOffset - dx
          x = ((x % setWidth) + setWidth) % setWidth
          const nearest = Math.round(x / w) * w
          offsetRef.current = ((nearest % setWidth) + setWidth) % setWidth
          track.style.transition = "transform 0.35s ease"
          track.style.transform = `translateX(-${offsetRef.current}px)`
          const onTrans = () => {
            track.style.transition = "none"
            track.removeEventListener("transitionend", onTrans)
          }
          track.addEventListener("transitionend", onTrans)
        } else {
          setInstant(false)
          setIndex(startIndex + (dx < 0 ? 1 : -1))
        }
      } else if (axis === "x" && track) {
        track.style.transition = "transform 0.3s ease"
        if (autoPlay) {
          offsetRef.current = startOffset
          track.style.transform = `translateX(-${startOffset}px)`
        } else {
          const count = Math.max(looped.length, 1)
          track.style.transform = `translateX(-${(startIndex / count) * 100}%)`
        }
      }
      axis = null
      resumeSoon()
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd)
    el.addEventListener("touchcancel", onEnd)
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
      window.clearTimeout(pausedTimerRef.current)
    }
  }, [canSlide, autoPlay, n, visible, looped.length])

  if (!products.length) {
    return (
      <p className="featured__empty">
        Öne çıkan ürün bulunamadı. Backend seed çalıştı mı?
      </p>
    )
  }

  const count = Math.max(looped.length, 1)
  const trackStyle = {
    // Fewer products than slots: keep slot width, center the row.
    width: `${(looped.length / visible) * 100}%`,
    ...(canSlide ? {} : { marginInline: "auto" }),
    ...(autoPlay && canSlide
      ? {}
      : {
          transform: canSlide
            ? `translateX(-${(index / count) * 100}%)`
            : "none",
        }),
  } as CSSProperties

  const sideStyle =
    sideArrows && photoHeight
      ? ({ ["--featured-photo-h" as string]: `${photoHeight}px` } as CSSProperties)
      : undefined

  const prevArrow = canSlide ? (
    <button
      type="button"
      className={`featured__arrow${sideArrows ? " featured__arrow--side featured__arrow--prev" : ""}`}
      onClick={() => step(-1)}
      aria-label={prevLabel}
    >
      <svg
        className="featured__arrow-icon"
        viewBox="0 0 16 16"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M14 8H4" />
        <path d="M10 2L2 8l8 6" />
      </svg>
    </button>
  ) : null

  const nextArrow = canSlide ? (
    <button
      type="button"
      className={`featured__arrow${sideArrows ? " featured__arrow--side featured__arrow--next" : ""}`}
      onClick={() => step(1)}
      aria-label={nextLabel}
    >
      <svg
        className="featured__arrow-icon"
        viewBox="0 0 16 16"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2 8h10" />
        <path d="M6 2l8 6-8 6" />
      </svg>
    </button>
  ) : null

  return (
    <div
      className={`featured${sideArrows && canSlide ? " featured--side-arrows" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClickCapture={(event) => {
        if (!skipClickRef.current) return
        event.preventDefault()
        event.stopPropagation()
        skipClickRef.current = false
      }}
    >
      {(title || (!sideArrows && canSlide)) && (
        <div className="featured__head">
          {title ? <h2 className="featured__title">{title}</h2> : <span />}
          {!sideArrows && canSlide ? (
            <div className="featured__arrows">
              {prevArrow}
              {nextArrow}
            </div>
          ) : null}
        </div>
      )}

      <div className="featured__stage" ref={stageRef} style={sideStyle}>
        {sideArrows && canSlide ? prevArrow : null}
        <div className="featured__viewport" ref={viewportRef}>
          <ul
            ref={trackRef}
            className={`featured__track${instant ? " is-instant" : ""}${canSlide ? " is-loop" : ""}${autoPlay && canSlide ? " is-continuous" : ""}`}
            style={trackStyle}
            onTransitionEnd={autoPlay ? undefined : onTrackTransitionEnd}
          >
            {looped.map((p, i) => (
              <li key={`${p.id}-${i}`} className="featured__item">
                <FeaturedCard product={p} />
              </li>
            ))}
          </ul>
        </div>
        {sideArrows && canSlide ? nextArrow : null}
      </div>
    </div>
  )
}
