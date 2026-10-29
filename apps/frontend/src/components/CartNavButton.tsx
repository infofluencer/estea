"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CART_ADDED_EVENT, CART_COUNT_EVENT } from "@/lib/cart-events"
import { NavCountBadge } from "@/components/NavCountBadge"
import { ProductToast } from "@/components/ProductToast"
import { useProductToast } from "@/components/useProductToast"

export function CartNavButton({ initialCount = 0 }: { initialCount?: number }) {
  const toast = useProductToast(CART_ADDED_EVENT)
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  useEffect(() => {
    function onCount(event: Event) {
      const next = (event as CustomEvent<{ count?: number }>).detail?.count
      if (typeof next === "number") setCount(next)
    }

    window.addEventListener(CART_COUNT_EVENT, onCount)
    return () => window.removeEventListener(CART_COUNT_EVENT, onCount)
  }, [])

  return (
    <div className="site-header__pop">
      <Link
        href="/sepet"
        data-testid="cart-icon"
        className="site-header__action"
        aria-label={count ? `Sepet, ${count} ürün` : "Sepet"}
        title="Sepet"
      >
        <span className="site-header__icon">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 7h15l-1.5 9h-12z" />
            <path d="M6 7l-1-3H2" />
            <circle cx="9" cy="20" r="1.25" />
            <circle cx="18" cy="20" r="1.25" />
          </svg>
          <NavCountBadge count={count} />
        </span>
        <span className="site-header__action-label">Sepetim</span>
      </Link>
      <ProductToast
        visible={toast.visible}
        item={toast.item}
        label="Sepete eklendi"
        href="/sepet"
        linkLabel="Sepeti gör"
        onPause={toast.pauseHide}
        onResume={toast.resumeHide}
      />
    </div>
  )
}
