import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "react-router-dom"

import { ExchangePanel } from "./exchange-panel"
import { ReturnPanel } from "./return-panel"

type ReturnInfo = {
  id: string
  order_id?: string | null
  created_at?: string | null
  metadata?: { escay_exchange?: { status?: string } | null } | null
}

type OrderInfo = {
  id: string
  display_id?: number | null
  created_at?: string | null
  email?: string | null
  total?: number | null
  currency_code?: string | null
  customer?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
  } | null
  items?: { id: string; title?: string | null; variant_title?: string | null; quantity?: number | null }[]
}

const longDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""

const money = (n?: number | null, cur?: string | null) =>
  n == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: (cur || "try").toUpperCase() }).format(Number(n))

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * İade / değişim sayfası (/iadeler/:id, /degisimler/:id). Sipariş sayfasından
 * ayrı: solda yapılacak iş (teslim al, reddet, iade kodu, değişim), sağda
 * müşteri ve sipariş özeti. Sidebar'da İadeler / Değişimler seçili kalır.
 */
export const ReturnDetail = ({ returnId }: { returnId: string }) => {
  const navigate = useNavigate()

  const ret = useQuery({
    queryKey: ["escay-return", returnId],
    queryFn: () =>
      getJson<{ return: ReturnInfo }>(`/admin/returns/${returnId}?fields=id,order_id,created_at,metadata`),
  })
  const orderId = ret.data?.return?.order_id || ""

  const order = useQuery({
    queryKey: ["escay-return-order", orderId],
    enabled: Boolean(orderId),
    queryFn: () =>
      getJson<{ order: OrderInfo }>(
        `/admin/orders/${orderId}?fields=id,display_id,created_at,email,total,currency_code,customer.first_name,customer.last_name,customer.phone,*shipping_address,items.id,items.title,items.variant_title,items.quantity`
      ),
  })

  if (ret.isLoading || (orderId && order.isLoading)) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">Yükleniyor…</Text>
      </Container>
    )
  }
  if (ret.isError || !orderId) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-error">İade bulunamadı.</Text>
      </Container>
    )
  }

  const r = ret.data!.return
  const o = order.data?.order
  const exchange = Boolean(r.metadata?.escay_exchange && r.metadata.escay_exchange.status !== "canceled")
  const a = o?.shipping_address
  const name =
    [o?.customer?.first_name, o?.customer?.last_name].filter(Boolean).join(" ") ||
    [a?.first_name, a?.last_name].filter(Boolean).join(" ") ||
    "—"
  const phone = o?.customer?.phone || a?.phone || ""
  const orderLabel = o?.display_id ? `#${o.display_id}` : "Sipariş"

  return (
    <div className="flex flex-col gap-x-4 gap-y-3 xl:flex-row xl:items-start">
      <div className="flex w-full min-w-0 flex-col gap-y-3">
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Heading level="h1">
                {orderLabel} {exchange ? "değişimi" : "iadesi"}
              </Heading>
              {exchange ? <Badge size="2xsmall" color="blue">Para iadesi yok</Badge> : null}
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {longDate(r.created_at)} tarihinde talep edildi
            </Text>
          </div>
          <Button size="small" variant="secondary" asChild>
            <Link to={`/orders/${orderId}`}>Siparişi aç</Link>
          </Button>
        </Container>
        <ReturnPanel orderId={orderId} returnId={returnId} />
        <ExchangePanel orderId={orderId} returnId={returnId} onCreated={(id) => navigate(`/degisimler/${id}`)} />
      </div>

      <div className="flex w-full flex-col gap-y-3 xl:max-w-[440px]">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Müşteri</Heading>
          </div>
          <div className="flex flex-col gap-1 px-6 py-4">
            <Text size="small" weight="plus">{name}</Text>
            {o?.email ? <Text size="small" className="text-ui-fg-subtle">{o.email}</Text> : null}
            {phone ? <Text size="small" className="text-ui-fg-subtle">{phone}</Text> : null}
          </div>
          {a?.address_1 ? (
            <div className="flex flex-col gap-1 px-6 py-4">
              <Text size="small" weight="plus">Teslimat adresi</Text>
              <Text size="small" className="text-ui-fg-subtle">
                {[a.address_1, a.address_2].filter(Boolean).join(" ")}
                <br />
                {[a.city, a.province, a.postal_code].filter(Boolean).join(" ")}
              </Text>
            </div>
          ) : null}
        </Container>

        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Heading level="h2">Sipariş</Heading>
            <Link to={`/orders/${orderId}`} className="txt-compact-small-plus text-ui-fg-interactive">
              {orderLabel}
            </Link>
          </div>
          <div className="flex flex-col gap-1 px-6 py-4">
            {(o?.items || []).map((it) => (
              <Text key={it.id} size="small">
                {it.quantity} × {[it.title, it.variant_title].filter(Boolean).join(" · ")}
              </Text>
            ))}
          </div>
          <div className="flex items-center justify-between px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">{longDate(o?.created_at)}</Text>
            <Text size="small" weight="plus">{money(o?.total, o?.currency_code)}</Text>
          </div>
        </Container>
      </div>
    </div>
  )
}
