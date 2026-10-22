import {
  computeCartDisplayTotals,
  includedVatFromGross,
  productSubtotalFromCart,
  roundMoney,
} from "@/lib/cart-pricing"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"

type SummaryItem = {
  id: string
  title: string
  quantity: number
  unit_price?: number | null
  subtotal?: number | null
  thumbnail?: string | null
  variant?: { title?: string | null } | null
}

type CheckoutOrderSummaryProps = {
  cart: {
    item_subtotal?: number | null
    subtotal?: number | null
    item_total?: number | null
    original_item_total?: number | null
    discount_total?: number | null
    shipping_total?: number | null
    total?: number | null
    items?: SummaryItem[] | null
  }
  /** When true, use Medusa shipping_total if already applied (checkout). */
  useAppliedShipping?: boolean
  /** Seçili kargo seçeneğinin hesaplanan ücreti (henüz uygulanmadıysa gösterilir). */
  shippingEstimate?: number | null
}

function preDiscountProductTotal(cart: CheckoutOrderSummaryProps["cart"]): number {
  const discount = Math.max(0, Number(cart.discount_total) || 0)
  const original = cart.original_item_total
  if (original != null && Number.isFinite(Number(original))) {
    return roundMoney(Number(original))
  }
  if (discount > 0 && cart.item_total != null) {
    return roundMoney(Number(cart.item_total) + discount)
  }
  return productSubtotalFromCart({
    item_total: cart.item_total,
    item_subtotal: cart.item_subtotal,
    subtotal: cart.subtotal,
    items: cart.items,
  })
}

export function CheckoutOrderSummary({
  cart,
  useAppliedShipping = false,
  shippingEstimate = null,
}: CheckoutOrderSummaryProps) {
  const items = cart.items || []
  const discount = Math.max(0, Number(cart.discount_total) || 0)
  const productSubtotal = preDiscountProductTotal(cart)

  const display = computeCartDisplayTotals(productSubtotal, shippingEstimate)
  const appliedShipping =
    useAppliedShipping &&
    cart.shipping_total != null &&
    Number(cart.shipping_total) >= 0
  const shipping = appliedShipping
    ? Number(cart.shipping_total)
    : display.shipping

  let total: number
  if (
    cart.total != null &&
    Number.isFinite(Number(cart.total)) &&
    (appliedShipping || discount > 0)
  ) {
    const medusaTotal = Number(cart.total)
    total = appliedShipping
      ? medusaTotal
      : roundMoney(medusaTotal + shipping)
  } else if (appliedShipping) {
    total = roundMoney(Math.max(0, productSubtotal - discount + shipping))
  } else {
    total =
      discount > 0
        ? roundMoney(Math.max(0, productSubtotal - discount + shipping))
        : display.total
  }

  const includedVat = includedVatFromGross(
    Math.max(0, productSubtotal - discount)
  )

  return (
    <aside className="checkout-summary">
      <div className="checkout-summary__panel">
        <h2 className="checkout-summary__title">Sipariş özeti</h2>

        <ul className="checkout-summary__items">
          {items.map((item) => {
            const variant =
              item.variant?.title && item.variant.title !== "Default"
                ? item.variant.title
                : null
            const lineLabel = variant
              ? `${item.title} — ${variant}`
              : item.title
            const lineAmount =
              typeof item.unit_price === "number"
                ? item.unit_price * item.quantity
                : item.subtotal != null && Number.isFinite(Number(item.subtotal))
                  ? Number(item.subtotal)
                  : item.unit_price

            return (
              <li key={item.id} className="checkout-summary__item">
                <div className="checkout-summary__item-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail || PRODUCT_IMAGE}
                    alt=""
                  />
                </div>
                <p className="checkout-summary__item-name">
                  {lineLabel}
                  <span className="checkout-summary__item-qty">
                    × {item.quantity}
                  </span>
                </p>
                <p className="checkout-summary__item-price">
                  {formatTry(lineAmount)}
                </p>
              </li>
            )
          })}
        </ul>

        <dl className="checkout-summary__totals">
          <div className="checkout-summary__row">
            <dt>Ara toplam</dt>
            <dd>{formatTry(productSubtotal)}</dd>
          </div>
          {discount > 0 ? (
            <div className="checkout-summary__row checkout-summary__muted">
              <dt>İndirim</dt>
              <dd>−{formatTry(discount)}</dd>
            </div>
          ) : null}
          <div className="checkout-summary__row">
            <dt>Kargo</dt>
            <dd>{formatTry(shipping)}</dd>
          </div>
          <div className="checkout-summary__divider" aria-hidden />
          <div className="checkout-summary__row checkout-summary__row--total">
            <dt>Toplam</dt>
            <dd>
              <span className="checkout-summary__total-amount">
                {formatTry(total)}
              </span>
              <span className="checkout-summary__vat-note">
                {formatTry(includedVat)} KDV dahil
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </aside>
  )
}
