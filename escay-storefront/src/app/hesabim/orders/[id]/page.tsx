import Link from "next/link"
import { redirect } from "next/navigation"
import { OrderDetail } from "@/components/order/OrderDetail"
import type { OrderDetailView } from "@/components/order/order-types"
import { getLoggedInCustomer } from "@/lib/auth/customer"
import { authHeaders } from "@/lib/auth/session"
import { sdk } from "@/lib/medusa"

export const dynamic = "force-dynamic"

const ORDER_FIELDS =
  "id,status,metadata,display_id,custom_display_id,email,currency_code,created_at,total,item_total,item_subtotal,original_item_total,discount_total,shipping_total,*items,*items.detail,*items.thumbnail,*items.variant,*items.variant.product,*shipping_address,*shipping_methods,*fulfillments,*fulfillments.labels,*fulfillments.items,*returns,*returns.metadata,*returns.items,*payment_collections"

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const customer = await getLoggedInCustomer()
  if (!customer) {
    redirect("/?login=1")
  }

  const { id } = await params
  const headers = await authHeaders()
  if (!headers) {
    redirect("/?login=1")
  }

  let order: OrderDetailView | null = null
  try {
    const result = await sdk.store.order.retrieve(
      id,
      { fields: ORDER_FIELDS },
      headers
    )
    order = result.order as OrderDetailView
  } catch {
    order = null
  }

  if (!order) {
    return (
      <div className="page-shell" style={{ paddingBottom: "3.5rem", maxWidth: "32rem" }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-logo)",
            fontSize: "clamp(1.25rem, 2.4vw, 1.55rem)",
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--brand-deep)",
          }}
        >
          Bu sipariş bulunamadı
        </h1>
        <p
          style={{
            margin: "1rem 0 1.75rem",
            fontFamily: "var(--font-garamond)",
            fontSize: "1.05rem",
            lineHeight: 1.6,
            opacity: 0.75,
          }}
        >
          Bu hesaba ait böyle bir sipariş yok veya bağlantı geçersiz. Sipariş
          listenden devam edebilirsin.
        </p>
        <Link href="/hesabim" className="cart-cta cart-cta--primary">
          Siparişlerine dön
        </Link>
      </div>
    )
  }

  return (
    <div className="page-shell" style={{ paddingBottom: "3.5rem" }}>
      <p
        style={{
          marginBottom: "1.5rem",
          fontFamily: "var(--font-sans)",
          fontSize: "0.88rem",
        }}
      >
        <Link href="/hesabim" style={{ opacity: 0.7 }}>
          ← Hesabıma dön
        </Link>
      </p>
      <OrderDetail order={order} returnContext={{ mode: "customer" }} />
    </div>
  )
}
