import Link from "next/link"
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

export type CheckoutSummaryCart = {
  item_subtotal?: number | null
  subtotal?: number | null
  item_total?: number | null
  original_item_total?: number | null
  discount_total?: number | null
  shipping_total?: number | null
  total?: number | null
  items?: SummaryItem[] | null
}

type TotalsOptions = {
  /** When true, use Medusa shipping_total if already applied (checkout). */
  useAppliedShipping?: boolean
  /** Seçili kargo seçeneğinin hesaplanan ücreti (henüz uygulanmadıysa gösterilir). */
  shippingEstimate?: number | null
}

export type CheckoutTotals = {
  productSubtotal: number
  discount: number
  shipping: number
  total: number
  includedVat: number
}

type CheckoutOrderSummaryProps = TotalsOptions & {
  cart: CheckoutSummaryCart
  /** "Düzenle" bağlantısı; boş string gizler. */
  editHref?: string
}

function preDiscountProductTotal(cart: CheckoutSummaryCart): number {
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

/** Özet paneli ile "Ödemeye geç" düğmesi aynı toplamı gösterir. */
export function computeCheckoutTotals(
  cart: CheckoutSummaryCart,
  { useAppliedShipping = false, shippingEstimate = null }: TotalsOptions = {}
): CheckoutTotals {
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
    total = appliedShipping ? medusaTotal : roundMoney(medusaTotal + shipping)
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

  return { productSubtotal, discount, shipping, total, includedVat }
}

function SummaryBody({
  items,
  totals,
}: {
  items: SummaryItem[]
  totals: CheckoutTotals
}) {
  return (
    <>
      <ul className="checkout-summary__items">
        {items.map((item) => {
          const variant =
            item.variant?.title && item.variant.title !== "Default"
              ? item.variant.title
              : null
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
                <img src={item.thumbnail || PRODUCT_IMAGE} alt="" />
                {item.quantity > 1 ? (
                  <span className="checkout-summary__item-badge">
                    {item.quantity}
                  </span>
                ) : null}
              </div>
              <p className="checkout-summary__item-name">
                {item.title}
                {variant ? (
                  <span className="checkout-summary__item-variant">{variant}</span>
                ) : null}
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
          <dd>{formatTry(totals.productSubtotal)}</dd>
        </div>
        {totals.discount > 0 ? (
          <div className="checkout-summary__row checkout-summary__muted">
            <dt>İndirim</dt>
            <dd>−{formatTry(totals.discount)}</dd>
          </div>
        ) : null}
        <div className="checkout-summary__row">
          <dt>Kargo</dt>
          <dd>{totals.shipping > 0 ? formatTry(totals.shipping) : "Ücretsiz"}</dd>
        </div>
        <div className="checkout-summary__divider" aria-hidden />
        <div className="checkout-summary__row checkout-summary__row--total">
          <dt>Toplam</dt>
          <dd>
            <span className="checkout-summary__total-amount">
              {formatTry(totals.total)}
            </span>
            <span className="checkout-summary__vat-note">
              {formatTry(totals.includedVat)} KDV dahil
            </span>
          </dd>
        </div>
      </dl>

      <ul className="checkout-summary__trust">
        <li>PayTR ile 3D Secure güvenli ödeme</li>
        <li>Hayrat / Trabzon&rsquo;daki fabrikamızdan gönderim</li>
        <li>
          Sorunuz için{" "}
          <a href="tel:+904626923061" className="checkout-summary__phone">
            0462 692 30 61
          </a>
        </li>
      </ul>
    </>
  )
}

export function CheckoutOrderSummary({
  cart,
  useAppliedShipping = false,
  shippingEstimate = null,
  editHref = "/sepet",
}: CheckoutOrderSummaryProps) {
  const items = cart.items || []
  const totals = computeCheckoutTotals(cart, {
    useAppliedShipping,
    shippingEstimate,
  })
  const itemCount = items.reduce((n, i) => n + (i.quantity || 1), 0)

  return (
    <aside className="checkout-summary" aria-label="Sipariş özeti">
      {/* Mobil: katlanır satır; form uzun, toplam her zaman görünür kalsın. */}
      <details className="checkout-summary__mobile">
        <summary className="checkout-summary__toggle">
          <span className="checkout-summary__toggle-label">
            Sipariş özeti
            <span className="checkout-summary__toggle-count">
              {itemCount} ürün
            </span>
          </span>
          <span className="checkout-summary__toggle-total">
            {formatTry(totals.total)}
          </span>
          <svg
            className="checkout-summary__toggle-icon"
            viewBox="0 0 12 8"
            width="12"
            height="8"
            aria-hidden
          >
            <path
              d="M1 1.5l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <div className="checkout-summary__mobile-body">
          <SummaryBody items={items} totals={totals} />
        </div>
      </details>

      <div className="checkout-summary__panel">
        <div className="checkout-summary__head">
          <h2 className="checkout-summary__title">Sipariş özeti</h2>
          {editHref ? (
            <Link href={editHref} className="checkout-summary__edit">
              Düzenle
            </Link>
          ) : null}
        </div>
        <SummaryBody items={items} totals={totals} />
      </div>
    </aside>
  )
}
