"use client"

import Link from "next/link"
import type { CartAddedPayload } from "@/lib/cart-events"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"

export function ProductToast({
  visible,
  item,
  label,
  href,
  linkLabel,
  onPause,
  onResume,
}: {
  visible: boolean
  item: CartAddedPayload | null
  label: string
  href: string
  linkLabel: string
  onPause: () => void
  onResume: () => void
}) {
  if (!visible || !item) return null

  return (
    <div
      className="site-header__toast is-visible"
      role="status"
      aria-live="polite"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
    >
      <p className="site-header__toast-label">{label}</p>
      <div className="site-header__toast-product">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item?.image || PRODUCT_IMAGE} alt={item?.title || ""} />
        <div className="site-header__toast-info">
          {item?.title ? (
            <p className="site-header__toast-title">{item.title}</p>
          ) : null}
          <p className="site-header__toast-price">{formatTry(item?.price)}</p>
        </div>
      </div>
      <Link href={href} className="site-header__toast-link">
        {linkLabel}
      </Link>
    </div>
  )
}
