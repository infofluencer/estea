"use client"

import Link from "next/link"
import { useTransition, type MouseEvent } from "react"
import { useFavorites } from "@/components/FavoritesProvider"
import { addFavoriteToCartAction } from "@/lib/actions"
import {
  countCartItems,
  notifyCartAdded,
  notifyCartCount,
} from "@/lib/cart-events"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"
import type { FavoriteProduct } from "@/lib/favorites"
import { productPath } from "@/lib/urls"

function preferredVariantId(item: FavoriteProduct) {
  if (item.variantId) return item.variantId
  if (item.id.startsWith("variant_")) return item.id
  return null
}

function FavoriteCard({ item }: { item: FavoriteProduct }) {
  const { toggleFavorite } = useFavorites()
  const [pending, start] = useTransition()
  const image = item.image || PRODUCT_IMAGE

  function onToggleFavorite(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite(item)
  }

  function onAddToCart(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    start(async () => {
      try {
        const result = await addFavoriteToCartAction(
          item.handle,
          preferredVariantId(item)
        )
        if (!result.ok) return
        notifyCartCount(countCartItems(result.cart))
        notifyCartAdded(
          {
            title: item.title,
            image,
            price: item.price,
          },
          {
            cart: result.cart,
            variantId: preferredVariantId(item),
            handle: item.handle,
          }
        )
      } catch {
        // Keep quiet — cart toast only fires on success.
      }
    })
  }

  return (
    <article className="featured__card favorites-card">
      <div className="favorites-card__unit">
        <div className="favorites-card__frame">
          <Link
            href={`${productPath(item.handle)}`}
            className="featured__media-link"
            aria-label={item.title}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="featured__photo" />
          </Link>

          <button
            type="button"
            className="featured__fav is-active"
            onClick={onToggleFavorite}
            aria-label="Favorilerden çıkar"
            title="Favorilerden çıkar"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="currentColor"
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

        <div className="favorites-card__body">
          <Link href={`${productPath(item.handle)}`} className="featured__meta favorites-card__title">
            <h2 className="featured__name">{item.title}</h2>
          </Link>
          <div className="favorites-card__row">
            <p className="featured__price favorites-card__price">
              <span>{formatTry(item.price)}</span>
            </p>
            <button
              type="button"
              className="favorites-card__cart"
              onClick={onAddToCart}
              disabled={pending}
            >
              {pending ? "…" : "Sepete ekle"}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function FavoritesPage() {
  const { items, isLoggedIn } = useFavorites()

  return (
    <section className="favorites-page" aria-label="Favoriler">
      <header className="favorites-page__head">
        <h1 className="featured__title">Favoriler</h1>
        <p className="favorites-page__count">
          {items.length
            ? `${items.length} ürün`
            : "Henüz favori ürün yok"}
          {isLoggedIn && items.length ? " · hesabına kayıtlı" : null}
        </p>
      </header>

      {!items.length ? (
        <div className="favorites-page__empty">
          <p>
            {isLoggedIn
              ? "Beğendiğin ürünleri kalp ile buraya ekleyebilirsin. Favorilerin hesabına kaydedilir."
              : "Beğendiğin ürünleri kalp ile buraya ekleyebilirsin. Giriş yaparsan favorilerin cihazlar arasında senkronize olur."}
          </p>
          <Link href="/" className="cart-cta">
            Öne çıkanlara bak
          </Link>
        </div>
      ) : (
        <ul className="favorites-grid">
          {items.map((item) => (
            <li key={item.id} className="favorites-grid__item">
              <FavoriteCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
