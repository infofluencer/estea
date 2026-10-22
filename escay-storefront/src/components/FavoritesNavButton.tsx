"use client"

import Link from "next/link"
import { FAVORITE_ADDED_EVENT } from "@/lib/favorites"
import { useFavorites } from "@/components/FavoritesProvider"
import { NavCountBadge } from "@/components/NavCountBadge"
import { ProductToast } from "@/components/ProductToast"
import { useProductToast } from "@/components/useProductToast"

export function FavoritesNavButton() {
  const toast = useProductToast(FAVORITE_ADDED_EVENT)
  const { items } = useFavorites()
  const count = items.length

  return (
    <div className="site-header__pop">
      <Link
        href="/istek-listesi"
        data-testid="favorites-icon"
        className="site-header__action"
        aria-label={count ? `Favoriler, ${count} ürün` : "Favoriler"}
        title="Favoriler"
      >
        <span className="site-header__icon">
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
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <NavCountBadge count={count} />
        </span>
      </Link>
      <ProductToast
        visible={toast.visible}
        item={toast.item}
        label="Favorilere eklendi"
        href="/istek-listesi"
        linkLabel="Favorileri gör"
        onPause={toast.pauseHide}
        onResume={toast.resumeHide}
      />
    </div>
  )
}
