"use client"

import { useTransition } from "react"
import { removeLineItemAction, updateLineItemAction } from "@/lib/actions"
import { notifyCartCount } from "@/lib/cart-events"

export function CartQtyForm({
  lineId,
  quantity,
  hideRemove = false,
}: {
  lineId: string
  quantity: number
  /** When true, only +/- controls (Remove lives elsewhere in the line). */
  hideRemove?: boolean
}) {
  const [pending, start] = useTransition()

  function setQty(next: number) {
    start(async () => {
      const count = await updateLineItemAction(lineId, next)
      notifyCartCount(count ?? 0)
    })
  }

  return (
    <div className="cart-qty" data-pending={pending || undefined}>
      <button
        type="button"
        className="cart-qty__btn"
        disabled={pending || quantity <= 1}
        onClick={() => setQty(quantity - 1)}
        aria-label="Adedi azalt"
      >
        −
      </button>
      <span className="cart-qty__value" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        className="cart-qty__btn"
        disabled={pending}
        onClick={() => setQty(quantity + 1)}
        aria-label="Adedi artır"
      >
        +
      </button>
      {!hideRemove ? (
        <button
          type="button"
          className="cart-qty__remove"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const count = await removeLineItemAction(lineId)
              notifyCartCount(count ?? 0)
            })
          }
        >
          Kaldır
        </button>
      ) : null}
    </div>
  )
}

export function CartRemoveButton({ lineId }: { lineId: string }) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      className="cart-line__remove"
      disabled={pending}
      data-pending={pending || undefined}
      onClick={() =>
        start(async () => {
          const count = await removeLineItemAction(lineId)
          notifyCartCount(count ?? 0)
        })
      }
    >
      Kaldır
    </button>
  )
}
