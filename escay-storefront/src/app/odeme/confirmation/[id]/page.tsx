import { TrackPurchase } from "@/components/TrackEvent"
import { analyticsItemFromLine } from "@/lib/analytics"
import Link from "next/link"
import { cookies } from "next/headers"
import { CheckoutConfirmationView } from "@/components/checkout/CheckoutConfirmationView"
import { FinalizePaidCheckoutOnMount } from "@/components/checkout/FinalizePaidCheckoutOnMount"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import type { OrderDetailView } from "@/components/order/order-types"
import { AUTH_COOKIE, LAST_ORDER_EMAIL_COOKIE } from "@/lib/checkout"
import { sdk } from "@/lib/medusa"
import styles from "@/components/checkout/checkout-confirmation.module.css"

export const dynamic = "force-dynamic"

const ORDER_FIELDS =
  "id,status,metadata,display_id,custom_display_id,email,currency_code,created_at,total,item_total,item_subtotal,original_item_total,discount_total,shipping_total,*items,*items.detail,*items.variant,*items.variant.product,*shipping_address,*shipping_methods,*fulfillments,*fulfillments.labels,*returns,*payment_collections"

function trackingHref(orderId: string, email: string) {
  const q = new URLSearchParams({ email })
  return `/order-tracking/${encodeURIComponent(orderId)}?${q.toString()}`
}

async function fetchOrderForConfirmation(
  id: string
): Promise<OrderDetailView | null> {
  const jar = await cookies()
  const token = jar.get(AUTH_COOKIE)?.value
  const guestEmail = jar.get(LAST_ORDER_EMAIL_COOKIE)?.value

  if (token) {
    try {
      const { order } = await sdk.store.order.retrieve(
        id,
        { fields: ORDER_FIELDS },
        { Authorization: `Bearer ${token}` }
      )
      return order as OrderDetailView
    } catch {
      /* fall through to lookup */
    }
  }

  if (guestEmail) {
    try {
      const res = await sdk.client.fetch<{ order: OrderDetailView }>(
        `/store/orders/lookup`,
        {
          method: "POST",
          body: { id, email: guestEmail },
        }
      )
      return res.order
    } catch {
      return null
    }
  }

  return null
}

function ConfirmationActions({ trackHref }: { trackHref: string }) {
  return (
    <div className={styles.actions}>
      <Link
        href={trackHref}
        className="cart-cta cart-cta--primary"
        data-testid="checkout-track-order"
      >
        Siparişini takip et
      </Link>
      <Link href="/urun-kategori" className="cart-cta">
        Alışverişe devam
      </Link>
      <Link href="/" className="cart-cta">
        Ana sayfa
      </Link>
    </div>
  )
}


export default async function CheckoutConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const order = await fetchOrderForConfirmation(id)
  const jar = await cookies()
  const guestEmail = jar.get(LAST_ORDER_EMAIL_COOKIE)?.value

  if (!order) {
    const trackHref =
      guestEmail && id ? trackingHref(id, guestEmail) : "/order-tracking"
    return (
      <div className="page-shell" style={{ paddingBottom: "3rem" }}>
        <FinalizePaidCheckoutOnMount />
        <CheckoutProgress current="confirmation" />
        <h1
          style={{
            fontFamily: "var(--font-logo)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--brand-deep)",
            margin: "0 0 0.75rem",
          }}
        >
          Siparişiniz alındı
        </h1>
        <p
          style={{
            margin: "0 0 1.5rem",
            fontFamily: "var(--font-garamond)",
            fontSize: "1.05rem",
            lineHeight: 1.55,
            opacity: 0.75,
            maxWidth: "32rem",
          }}
        >
          Siparişiniz alındı. Detaylar yüklenemedi — sipariş numarası ve e-posta
          ile takip edebilirsiniz.
        </p>
        <ConfirmationActions trackHref={trackHref} />
      </div>
    )
  }

  const orderEmail = (order.email || guestEmail || "").trim()
  const trackHref = orderEmail
    ? trackingHref(order.id, orderEmail)
    : "/order-tracking"

  return (
    <div className="page-shell" style={{ paddingBottom: "3.5rem" }}>
      <FinalizePaidCheckoutOnMount />
      <CheckoutProgress current="confirmation" />
      <TrackPurchase
        order={{
          id: order.id,
          total: Number(order.total ?? 0),
          items: (order.items || []).map((i) =>
            analyticsItemFromLine(i as Parameters<typeof analyticsItemFromLine>[0])
          ),
        }}
      />
      <CheckoutConfirmationView
        order={order}
        actions={<ConfirmationActions trackHref={trackHref} />}
      />
    </div>
  )
}
