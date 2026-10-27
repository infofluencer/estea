/**
 * Es Çay TR storefront — KDV dahil tüketici fiyatları.
 * TODO(K2): çay KDV oranı mali müşavir teyidiyle NEXT_PUBLIC_VAT_RATE'e yazılır
 * (backend region tax rate + PARASUT_DEFAULT_VAT_RATE ile aynı olmalı).
 */
export const VAT_RATE = Number(process.env.NEXT_PUBLIC_VAT_RATE ?? 1)

/**
 * Yedek kargo ücreti (TRY) — yalnızca gösterim; asıl ücret Medusa shipping
 * option'dan gelir. TODO(K4): sabit ücret / ücretsiz kargo eşiği kararı.
 */
export const CART_SHIPPING_PRICE = Number(process.env.NEXT_PUBLIC_SHIPPING_FALLBACK_PRICE ?? 99.9)

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

/** VAT portion inside a tax-inclusive gross amount. */
export function includedVatFromGross(gross: number): number {
  if (!gross || gross <= 0) return 0
  return roundMoney((gross * VAT_RATE) / (100 + VAT_RATE))
}

export type CartDisplayTotals = {
  subtotal: number
  shipping: number
  total: number
  includedVat: number
}

export function computeCartDisplayTotals(
  productSubtotal: number,
  shippingEstimate?: number | null
): CartDisplayTotals {
  const subtotal = roundMoney(productSubtotal)
  const shipping =
    shippingEstimate != null && Number.isFinite(Number(shippingEstimate))
      ? roundMoney(Number(shippingEstimate))
      : CART_SHIPPING_PRICE
  const total = roundMoney(subtotal + shipping)
  const includedVat = includedVatFromGross(subtotal)
  return { subtotal, shipping, total, includedVat }
}

type CartLike = {
  item_total?: number | null
  item_subtotal?: number | null
  subtotal?: number | null
  items?: {
    subtotal?: number | null
    unit_price?: number | null
    quantity?: number | null
  }[] | null
}

/** Product subtotal from Medusa cart (tax-inclusive, major TRY units). */
export function productSubtotalFromCart(cart: CartLike): number {
  const direct = cart.item_total ?? cart.item_subtotal ?? cart.subtotal
  if (direct != null && Number.isFinite(Number(direct))) {
    return roundMoney(Number(direct))
  }

  const items = cart.items || []
  const sum = items.reduce((acc, item) => {
    if (item.subtotal != null && Number.isFinite(Number(item.subtotal))) {
      return acc + Number(item.subtotal)
    }
    const qty = item.quantity || 0
    if (item.unit_price != null && qty > 0) {
      return acc + Number(item.unit_price) * qty
    }
    return acc
  }, 0)

  return roundMoney(sum)
}
