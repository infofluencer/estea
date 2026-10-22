import {
  computeCartDisplayTotals,
  includedVatFromGross,
  roundMoney,
} from "@/lib/cart-pricing"
import { formatTry } from "@/lib/medusa"

type CartSummaryProps = {
  /** Pre-discount product subtotal (tax-inclusive TRY). */
  subtotal: number
  discountTotal?: number | null
  /** Medusa cart total after discount (items only, no shipping) when available. */
  cartTotal?: number | null
  /**
   * Backend'den gelen kargo ücreti. null → henüz hesaplanamadı (ör. adres
   * yok): "Ödeme adımında hesaplanır" yazılır, toplam kargo hariç gösterilir.
   */
  shipping?: number | null
}

export function CartSummary({
  subtotal,
  discountTotal = 0,
  cartTotal = null,
  shipping: shippingEstimate = null,
}: CartSummaryProps) {
  const discount = Math.max(0, Number(discountTotal) || 0)
  const shippingPending = shippingEstimate == null
  const { shipping: displayShipping, total: displayTotal } =
    computeCartDisplayTotals(subtotal, shippingEstimate)
  const shipping = shippingPending ? 0 : displayShipping
  const fullTotal = shippingPending ? roundMoney(subtotal) : displayTotal
  const itemsAfterDiscount =
    cartTotal != null && Number.isFinite(Number(cartTotal)) && discount > 0
      ? Number(cartTotal)
      : roundMoney(Math.max(0, subtotal - discount))
  const total =
    discount > 0 ? roundMoney(itemsAfterDiscount + shipping) : fullTotal
  const vatNote = includedVatFromGross(Math.max(0, subtotal - discount))

  return (
    <dl className="cart-totals">
      <div className="cart-totals__row">
        <dt>Ara toplam</dt>
        <dd>{formatTry(subtotal)}</dd>
      </div>
      {discount > 0 ? (
        <div className="cart-totals__row">
          <dt>İndirim</dt>
          <dd>−{formatTry(discount)}</dd>
        </div>
      ) : null}
      <div className="cart-totals__row">
        <dt>Kargo</dt>
        <dd>
          {shippingPending ? "Ödeme adımında hesaplanır" : formatTry(shipping)}
        </dd>
      </div>
      <div className="cart-totals__divider" aria-hidden />
      <div className="cart-totals__row cart-totals__row--total">
        <dt>{shippingPending ? "Toplam (kargo hariç)" : "Toplam"}</dt>
        <dd>
          <span className="cart-totals__total-amount">{formatTry(total)}</span>
          <span className="cart-totals__vat-note">
            {formatTry(vatNote)} KDV dahil
          </span>
        </dd>
      </div>
    </dl>
  )
}
