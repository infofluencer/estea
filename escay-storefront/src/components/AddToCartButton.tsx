"use client"

import { useState, useTransition } from "react"
import { addToCartAction } from "@/lib/actions"
import { countCartItems, notifyCartAdded, notifyCartCount } from "@/lib/cart-events"

export function AddToCartButton({
  variantId,
  title,
  image,
  price,
  className,
  disabled,
}: {
  variantId: string
  title?: string
  image?: string | null
  price?: number | null
  className?: string
  disabled?: boolean
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isDisabled = disabled || !variantId || pending

  return (
    <>
      <button
        type="button"
        data-testid="add-to-cart"
        className={className}
        disabled={isDisabled}
        onClick={() =>
          start(async () => {
            setError(null)
            const result = await addToCartAction(variantId)
            if (!result.ok) {
              setError(result.message)
              return
            }
            notifyCartCount(countCartItems(result.cart))
            notifyCartAdded({ title, image, price }, { cart: result.cart, variantId })
          })
        }
        style={
          className
            ? undefined
            : {
                padding: "0.75rem 1.25rem",
                background: "#111",
                color: "#fff",
                border: 0,
                borderRadius: 3,
                cursor: "pointer",
              }
        }
      >
        {pending ? "Ekleniyor…" : "Sepete ekle"}
      </button>
      {error ? (
        <p
          role="alert"
          style={{
            margin: "0.45rem 0 0",
            fontSize: "0.72rem",
            lineHeight: 1.4,
            color: "var(--brand-red-hot, #b42318)",
          }}
        >
          {error}
        </p>
      ) : null}
    </>
  )
}
