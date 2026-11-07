import Link from "next/link"
import { redirect } from "next/navigation"
import { OrderDetail } from "@/components/order/OrderDetail"
import type { OrderDetailView } from "@/components/order/order-types"
import { getLoggedInCustomer } from "@/lib/auth/customer"
import { authHeaders } from "@/lib/auth/session"
import { sdk } from "@/lib/medusa"
import styles from "../../account.module.css"

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
      <div className="page-shell">
        <div className={styles.notFound}>
          <h1 className={styles.viewTitle}>Bu sipariş bulunamadı</h1>
          <p className={styles.viewLead}>
            Bu hesaba ait böyle bir sipariş yok veya bağlantı geçersiz. Sipariş
            listenden devam edebilirsin.
          </p>
          <Link href="/hesabim#siparisler" className={styles.inkBtn}>
            Siparişlerime dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell" style={{ paddingTop: "1.5rem", paddingBottom: "3.5rem" }}>
      <Link href="/hesabim#siparisler" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="m15 6-6 6 6 6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Siparişlerim
      </Link>
      <OrderDetail order={order} returnContext={{ mode: "customer" }} />
    </div>
  )
}
