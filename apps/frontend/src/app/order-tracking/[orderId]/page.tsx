import Link from "next/link"
import { OrderDetail } from "@/components/order/OrderDetail"
import type { OrderDetailView } from "@/components/order/order-types"
import { lookupOrderAction } from "@/lib/order-tracking-actions"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Sipariş Detayı | Es Çay",
}

export default async function OrderTrackingResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>
  searchParams: Promise<{ email?: string }>
}) {
  const { orderId } = await params
  const sp = await searchParams
  const email = typeof sp.email === "string" ? sp.email.trim() : ""

  let order: OrderDetailView | null = null
  let error: string | null = null

  if (!email) {
    error = "Sipariş bulunamadı, bilgileri kontrol edin."
  } else {
    const result = await lookupOrderAction(orderId, email)
    if (!result.ok) {
      error = result.message
    } else if (result.order.id !== orderId) {
      // Defensive: path must match resolved order
      error = "Sipariş bulunamadı, bilgileri kontrol edin."
    } else {
      order = result.order
    }
  }

  if (!order || error) {
    return (
      <div className="page-shell" style={{ paddingBottom: "3rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-logo)",
            color: "var(--brand-deep)",
          }}
        >
          Sipariş bulunamadı
        </h1>
        <p style={{ opacity: 0.7, marginBottom: "1.5rem" }}>
          {error || "Sipariş bulunamadı, bilgileri kontrol edin."}
        </p>
        <Link href="/order-tracking" className="cart-cta cart-cta--primary">
          Takip formuna dön
        </Link>
      </div>
    )
  }

  return (
    <div className="page-shell" style={{ paddingBottom: "3.5rem" }}>
      <OrderDetail
        order={order}
        returnContext={{ mode: "guest", email }}
      />
      <div
        style={{
          marginTop: "2rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <Link href="/order-tracking" className="cart-cta">
          Yeni sorgu
        </Link>
        <Link href="/" className="cart-cta">
          Ana sayfa
        </Link>
      </div>
    </div>
  )
}
