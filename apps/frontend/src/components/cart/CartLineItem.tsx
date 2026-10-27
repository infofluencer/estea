import Link from "next/link"
import { CartQtyForm, CartRemoveButton } from "@/components/CartQtyForm"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"

export type CartLineItemData = {
  id: string
  quantity: number
  product_title?: string | null
  title?: string | null
  thumbnail?: string | null
  subtotal?: number | null
  unit_price?: number | null
  productHref?: string | null
  variant?: string | null
}

export function CartLineItem({ item }: { item: CartLineItemData }) {
  const lineTotal =
    item.subtotal ??
    (typeof item.unit_price === "number"
      ? item.unit_price * item.quantity
      : undefined)
  const thumb = item.thumbnail || PRODUCT_IMAGE
  const displayTitle = item.product_title || item.title || ""

  return (
    <li className="cart-line">
      <div className="cart-line__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt={displayTitle} />
      </div>

      <div className="cart-line__body">
        <div className="cart-line__header">
          <div className="cart-line__headline">
            {item.productHref ? (
              <Link
                href={item.productHref}
                className="cart-line__title"
              >
                {displayTitle}
              </Link>
            ) : (
              <span className="cart-line__title">{displayTitle}</span>
            )}
            {item.variant ? (
              <p className="cart-line__variant">{item.variant}</p>
            ) : null}
          </div>
          <CartRemoveButton lineId={item.id} />
        </div>

        <div className="cart-line__footer">
          <CartQtyForm lineId={item.id} quantity={item.quantity} hideRemove />
          <p className="cart-line__total">{formatTry(lineTotal)}</p>
        </div>
      </div>
    </li>
  )
}
