import { redirect } from "next/navigation"
import { AccountDashboard } from "./AccountDashboard"
import { getLoggedInCustomer } from "@/lib/auth/customer"
import { authHeaders } from "@/lib/auth/session"
import { listTrCities } from "@/lib/checkout-address"
import { sdk } from "@/lib/medusa"

export const dynamic = "force-dynamic"

type OrderListItem = {
  id?: string
  title?: string | null
  quantity?: number | null
  thumbnail?: string | null
  unit_price?: number | null
  variant?: { title?: string | null } | null
}

export default async function AccountPage() {
  const customer = await getLoggedInCustomer()
  if (!customer) {
    redirect("/?login=1")
  }

  const headers = await authHeaders()
  let orders: {
    id: string
    display_id?: number | null
    created_at?: string | null
    total?: number | null
    status?: string | null
    return_status?: string | null
    return_meta?: {
      rejected?: boolean
      escay_rejection?: { rejected?: boolean } | null
      paytr_refund?: { status?: string | null } | null
    } | null
    items: {
      id?: string
      title?: string | null
      quantity?: number | null
      thumbnail?: string | null
      unit_price?: number | null
      variant_title?: string | null
    }[]
    item_count: number
  }[] = []

  if (headers) {
    try {
      const result = await sdk.store.order.list(
        {
          limit: 30,
          order: "-created_at",
          fields:
            "id,display_id,created_at,total,status,metadata,*returns,*returns.metadata,*items,*items.thumbnail,*items.variant,*fulfillments,*fulfillments.labels,*payment_collections",
        },
        headers
      )
      orders = (result.orders || []).map((o) => {
        const returns = (
          o as {
            returns?: {
              status?: string | null
              created_at?: string | null
              metadata?: {
                rejected?: boolean
                escay_rejection?: { rejected?: boolean } | null
                paytr_refund?: { status?: string | null } | null
              } | null
            }[]
          }
        ).returns
        const latest = [...(returns || [])].sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
          return tb - ta
        })[0]
        const rawItems = ((o as { items?: OrderListItem[] }).items || []).map(
          (item) => ({
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            thumbnail: item.thumbnail,
            unit_price: item.unit_price,
            variant_title: item.variant?.title ?? null,
          })
        )
        const fulfillments = (
          o as {
            fulfillments?: {
              shipped_at?: string | Date | null
              delivered_at?: string | Date | null
              labels?: { tracking_number?: string | null }[] | null
            }[]
          }
        ).fulfillments
        const payment_collections = (
          o as { payment_collections?: { status?: string | null }[] }
        ).payment_collections
        return {
          id: o.id,
          display_id: o.display_id,
          created_at:
            o.created_at instanceof Date
              ? o.created_at.toISOString()
              : o.created_at ?? null,
          total: o.total,
          status: o.status,
          return_status: latest?.status ?? null,
          return_meta: latest?.metadata ?? null,
          items: rawItems,
          item_count: rawItems.reduce(
            (sum, it) => sum + (Number(it.quantity) || 1),
            0
          ),
          fulfillments: (fulfillments || []).map((f) => ({
            shipped_at:
              f.shipped_at instanceof Date
                ? f.shipped_at.toISOString()
                : f.shipped_at ?? null,
            delivered_at:
              f.delivered_at instanceof Date
                ? f.delivered_at.toISOString()
                : f.delivered_at ?? null,
            labels: f.labels ?? null,
          })),
          payment_collections: payment_collections ?? null,
        }
      })
    } catch {
      orders = []
    }
  }

  return (
    <div className="page-shell">
      <AccountDashboard
        customer={{
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
        }}
        orders={orders}
        addresses={(customer.addresses || []).map((a) => ({
          id: a.id,
          first_name: a.first_name,
          last_name: a.last_name,
          address_1: a.address_1,
          city: a.city,
          postal_code: a.postal_code,
          phone: a.phone,
          metadata: a.metadata as { district?: string | null } | null,
        }))}
        cities={listTrCities()}
      />
    </div>
  )
}
