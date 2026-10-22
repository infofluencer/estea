"use client"

import Link from "next/link"
import { useEffect, useState, useTransition, type MouseEvent } from "react"
import { DeferredImage } from "@/components/DeferredImage"
import { useFavorites } from "@/components/FavoritesProvider"
import { addToCartAction } from "@/lib/actions"
import { countCartItems, notifyCartAdded, notifyCartCount } from "@/lib/cart-events"
import { formatTry } from "@/lib/medusa"
import type { LowStockLabel } from "@/lib/stock"
import { SoldOutStamp } from "@/components/SoldOutStamp"
import styles from "./categories.module.css"
import { productPath } from "@/lib/urls"

function scheduleIdle(fn: () => void) {
  if (typeof window === "undefined") return () => {}
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 2500 })
    return () => window.cancelIdleCallback(id)
  }
  const timer = window.setTimeout(fn, 1200)
  return () => window.clearTimeout(timer)
}

export type CategoryListProduct = {
  /** Unique list key (product id, or product:variant when expanded). */
  cardKey: string
  id: string
  /** When set, favorites are keyed per variant so sibling color cards stay independent. */
  variantId?: string | null
  handle: string
  title: string
  image: string
  /** Second angle shown on card hover. */
  hoverImage?: string | null
  price: number | null
  originalPrice: number | null
  subtitle: string | null
  colorCount: number
  soldOut?: boolean
  /** Product-total low stock (not per-variant); omit when sold out. */
  lowStock?: LowStockLabel | null
}

export function CategoryProductCard({
  product,
  priority = false,
}: {
  product: CategoryListProduct
  priority?: boolean
}) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const [pending, start] = useTransition()
  const [cartError, setCartError] = useState<string | null>(null)
  const favoriteId = product.variantId || product.id
  const favorited = isFavorite(favoriteId)
  const soldOut = Boolean(product.soldOut)
  const lowStock = !soldOut ? product.lowStock ?? null : null
  const hoverImage =
    product.hoverImage && product.hoverImage !== product.image
      ? product.hoverImage
      : null
  const [hoverSrc, setHoverSrc] = useState<string | null>(null)
  const canQuickAdd = !soldOut && Boolean(product.variantId)

  useEffect(() => {
    setHoverSrc(null)
    if (!hoverImage || !priority) return
    return scheduleIdle(() => setHoverSrc(hoverImage))
  }, [hoverImage, priority, product.cardKey])

  function prefetchHover() {
    if (hoverImage) setHoverSrc(hoverImage)
  }
  const onSale =
    product.originalPrice != null &&
    product.price != null &&
    Number(product.originalPrice) > Number(product.price)

  const productHref = (() => {
    const params = new URLSearchParams()
    if (product.variantId) params.set("v", product.variantId)
    else if (product.subtitle) params.set("color", product.subtitle)
    const query = params.toString()
    return query
      ? `${productPath(product.handle)}?${query}`
      : `${productPath(product.handle)}`
  })()

  function onToggleFavorite(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite({
      id: favoriteId,
      handle: product.handle,
      title: product.title,
      price: product.price,
      image: product.image,
      variantId: product.variantId || null,
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
          image: product.image,
          price: product.price,
        },
        { cart: result.cart, variantId: product.variantId }
      )
    })
  }

  return (
    <article
      className={`${styles.card}${soldOut ? ` ${styles.cardSoldOut}` : ""}`}
      onMouseEnter={prefetchHover}
      onFocusCapture={prefetchHover}
    >
      <div className={styles.media}>
        <Link
          href={productHref}
          className={styles.mediaLink}
          aria-label={soldOut ? `${product.title} — Tükendi` : product.title}
        >
          <DeferredImage
            src={product.image}
            alt=""
            className={styles.photo}
            loading="eager"
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            fadeIn={false}
          />
          {hoverSrc ? (
            <DeferredImage
              src={hoverSrc}
              alt=""
              className={`${styles.photo} ${styles.photoHover}`}
              loading="lazy"
              decoding="async"
              fadeIn={false}
              showSpinner={false}
              aria-hidden
            />
          ) : null}
          {soldOut ? (
            <SoldOutStamp />
          ) : lowStock ? (
            <span
              className={`${styles.lowStockStamp}${
                lowStock.kind === "critical"
                  ? ` ${styles.lowStockStampCritical}`
                  : ""
              }`}
              aria-hidden
            >
              {lowStock.text}
            </span>
          ) : null}
        </Link>

        {!soldOut ? <div className={styles.hoverVeil} aria-hidden /> : null}

        {canQuickAdd ? (
          <button
            type="button"
            className={styles.quickAdd}
            onClick={onQuickAdd}
            disabled={pending}
          >
            {pending ? "Ekleniyor…" : "Sepete Ekle"}
          </button>
        ) : null}

        {cartError ? (
          <p className={styles.quickAddError} role="alert">
            {cartError}
          </p>
        ) : null}

        <button
          type="button"
          data-testid="favorite-toggle"
          className={`${styles.fav}${favorited ? ` ${styles.favActive}` : ""}`}
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

      <Link href={productHref} className={styles.metaLink}>
        <h2 className={styles.name}>{product.title}</h2>
        {product.subtitle ? (
          <p className={styles.subtitle}>{product.subtitle}</p>
        ) : null}
        {product.colorCount > 1 ? (
          <p className={styles.variants}>{product.colorCount} renk</p>
        ) : null}
        <div className={styles.priceRow}>
          <span>{formatTry(product.price)}</span>
          {onSale ? (
            <span className={styles.priceOld}>
              {formatTry(product.originalPrice)}
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  )
}
