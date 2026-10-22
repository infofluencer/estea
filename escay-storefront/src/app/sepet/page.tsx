import { getCart } from "@/lib/cart"
import { productSubtotalFromCart } from "@/lib/cart-pricing"
import { EnsureCart } from "@/components/EnsureCart"
import { CartActions } from "@/components/cart/CartActions"
import { CartEmpty } from "@/components/cart/CartEmpty"
import { CartInfoAside } from "@/components/cart/CartInfoAside"
import { CartItems } from "@/components/cart/CartItems"
import { CartSummary } from "@/components/cart/CartSummary"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { PromoCodeForm } from "@/components/checkout/PromoCodeForm"
import { listShippingOptionsAction } from "@/lib/checkout-actions"
import { RestorePendingCheckoutOnMount } from "@/components/checkout/RestorePendingCheckoutOnMount"

export const dynamic = "force-dynamic"

export default async function CartPage() {
  const cart = await getCart()
  const items = cart?.items || []
  const hasItems = Boolean(cart?.id && items.length)

  if (!hasItems) {
    return (
      <div className="cart-page-wrap">
        <div className="page-shell cart-page">
          <CheckoutProgress />
          <div className="cart-layout cart-layout--empty">
            <div className="cart-main">
              <RestorePendingCheckoutOnMount redirectOnRestore="/sepet">
                {cart ? <CartEmpty /> : <EnsureCart />}
              </RestorePendingCheckoutOnMount>
            </div>
            <div className="cart-side">
              <CartInfoAside />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const discountTotal = Number(
    (cart as { discount_total?: number | null })?.discount_total ?? 0
  )
  const originalItemTotal = (
    cart as { original_item_total?: number | null }
  ).original_item_total
  const productSubtotal =
    originalItemTotal != null && Number.isFinite(Number(originalItemTotal))
      ? Number(originalItemTotal)
      : discountTotal > 0 && cart!.item_total != null
        ? Number(cart!.item_total) + discountTotal
        : productSubtotalFromCart(cart!)
  // Kargo ücreti backend shipping option'dan — adres yoksa seçenek
  // dönmeyebilir; o zaman "Ödeme adımında hesaplanır".
  const shippingRes = await listShippingOptionsAction().catch(() => null)
  const shippingEstimate =
    shippingRes && shippingRes.ok ? shippingRes.options[0]?.amount ?? null : null

  const promotions = (
    (cart as { promotions?: { id?: string; code?: string | null }[] })
      ?.promotions || []
  )
    .filter((p) => p.code)
    .map((p) => ({ code: String(p.code) }))

  return (
    <div className="cart-page-wrap">
      <div className="page-shell cart-page">
        <CheckoutProgress />

        <div className="cart-layout">
          <h1 className="cart-main__title">
            Sepetinizde {itemCount} ürün var.
          </h1>

          <div className="cart-items-block">
            <CartItems items={items} />
          </div>

          <div className="cart-side">
            <CartInfoAside />
            <PromoCodeForm applied={promotions} refreshOnSuccess />
          </div>

          <div className="cart-footer-block">
            <CartSummary
              subtotal={productSubtotal}
              discountTotal={discountTotal}
              cartTotal={cart!.total}
              shipping={shippingEstimate}
            />
            <CartActions />
          </div>
        </div>
      </div>
    </div>
  )
}
