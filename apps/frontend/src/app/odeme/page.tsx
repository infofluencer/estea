import Link from "next/link"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { RestorePendingCheckoutOnMount } from "@/components/checkout/RestorePendingCheckoutOnMount"
import { CheckoutForm } from "./CheckoutForm"
import { TrackBeginCheckout } from "@/components/TrackEvent"
import { analyticsItemFromLine } from "@/lib/analytics"
import { cartLineImage, variantLabel } from "@/components/cart/cart-utils"
import { loadCheckoutBootstrap } from "@/lib/checkout-actions"
import { listTrCities } from "@/lib/checkout-address"

export const dynamic = "force-dynamic"

export default async function CheckoutPage() {
  const { cart, customer, bankTransfer } = await loadCheckoutBootstrap()
  const hasItems = Boolean(cart?.id && (cart.items || []).length)

  if (!hasItems) {
    return (
      <div className="checkout-page-wrap">
        <div className="page-shell checkout-page">
          <CheckoutProgress current="address" />
          <RestorePendingCheckoutOnMount redirectOnRestore="/odeme">
            {!cart ? (
              <div className="checkout-empty" data-testid="checkout-empty">
                <h1 className="checkout-empty__title">Ödeme</h1>
                <p className="checkout-empty__text">Aktif sepet bulunamadı.</p>
                <Link href="/sepet" className="cart-cta cart-cta--primary">
                  Sepete git
                </Link>
              </div>
            ) : (
              <div className="checkout-empty" data-testid="checkout-empty">
                <h1 className="checkout-empty__title">Ödeme</h1>
                <p className="checkout-empty__text">
                  Sepetiniz boş. Önce ürün ekleyin.
                </p>
                <Link href="/sepet" className="cart-cta cart-cta--primary">
                  Sepete git
                </Link>
              </div>
            )}
          </RestorePendingCheckoutOnMount>
        </div>
      </div>
    )
  }

  const trCities = listTrCities()

  return (
    <div className="checkout-page-wrap">
      <div className="page-shell checkout-page">
        <TrackBeginCheckout
          items={(cart!.items || []).map((i) =>
            analyticsItemFromLine(i as Parameters<typeof analyticsItemFromLine>[0])
          )}
          total={Number(cart!.total ?? 0)}
        />
        <CheckoutForm
          cities={trCities}
          bankTransfer={bankTransfer}
          cart={{
            id: cart!.id,
            email: cart!.email,
            item_subtotal: cart!.item_subtotal,
            item_total: cart!.item_total,
            subtotal: cart!.subtotal,
            discount_total: (cart as { discount_total?: number | null })
              .discount_total,
            original_item_total: (
              cart as { original_item_total?: number | null }
            ).original_item_total,
            shipping_total: cart!.shipping_total,
            total: cart!.total,
            promotions: (
              (cart as { promotions?: { id?: string; code?: string | null }[] })
                .promotions || []
            )
              .filter((p) => p.code)
              .map((p) => ({
                id: p.id || String(p.code),
                code: String(p.code),
              })),
            items: (cart!.items || []).map((i) => {
              const color = variantLabel(i) || i.variant?.title || null
              return {
                id: i.id,
                title: i.title,
                quantity: i.quantity,
                unit_price: i.unit_price,
                subtotal: i.subtotal,
                thumbnail: cartLineImage(i),
                variant: color ? { title: color } : null,
              }
            }),
            shipping_address: cart!.shipping_address,
            shipping_methods: cart!.shipping_methods,
          }}
          customer={
            customer
              ? {
                  id: customer.id,
                  email: customer.email,
                  first_name: customer.first_name,
                  last_name: customer.last_name,
                  addresses: customer.addresses,
                }
              : null
          }
        />
      </div>
    </div>
  )
}
