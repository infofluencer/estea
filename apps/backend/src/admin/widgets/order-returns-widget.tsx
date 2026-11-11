import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { TriangleRightMini } from "@medusajs/icons"
import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"

import { ExchangePanel } from "../components/exchange-panel"
import { isRejected, statusLabel, type ReturnRow } from "../components/return-panel"

const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""

/**
 * Sipariş sayfası "İade ve değişim" kutusu — yalnız özet. Her iade bir satır;
 * tıklayınca iade sayfası açılır (/iadeler/:id, değişimse /degisimler/:id),
 * teslim alma / reddetme / iade kodu orada. Buradan yalnız yeni değişim açılır.
 */
const OrderReturnsWidget = () => {
  const { id: orderId } = useParams()
  const navigate = useNavigate()

  const { data } = useQuery({
    // İade sayfasının sorgusundan ayrı alanlar; önek aynı ki iade işlemleri bunu da yenilesin.
    queryKey: ["escay-order-returns", orderId, "summary"],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=id,*returns,*returns.metadata,*returns.items,items.id,items.title,items.variant_title,items.detail.delivered_quantity,items.detail.return_requested_quantity,items.detail.return_received_quantity,items.detail.return_dismissed_quantity`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{
        order?: {
          returns?: ReturnRow[]
          items?: {
            id: string
            title?: string | null
            variant_title?: string | null
            detail?: Record<string, unknown> | null
          }[]
        }
      }>
    },
  })

  if (!orderId || !data) return null
  const returns = [...(data.order?.returns || [])].sort((a, b) =>
    String(b.created_at || "").localeCompare(String(a.created_at || ""))
  )
  const lineTitle = new Map(
    (data.order?.items || []).map((i) => [i.id, [i.title, i.variant_title].filter(Boolean).join(" · ")])
  )

  // Teslim edilmiş ve henüz iade istenmemiş adet varsa değişim açılabilir.
  const num = (v: unknown) =>
    v && typeof v === "object" && "value" in (v as object) ? Number((v as { value: unknown }).value) : Number(v || 0)
  const canExchange = (data.order?.items || []).some((i) => {
    const d = i.detail || {}
    return (
      num(d.delivered_quantity) -
        num(d.return_requested_quantity) -
        num(d.return_received_quantity) -
        num(d.return_dismissed_quantity) >
      0
    )
  })
  if (!returns.length && !canExchange) return null

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">İade ve değişim</Heading>
      </div>
      {returns.map((r) => {
        const st = statusLabel(r)
        const exchange = Boolean(r.metadata?.escay_exchange && r.metadata.escay_exchange.status !== "canceled")
        const waiting = r.status === "requested" && !isRejected(r)
        const noCode = waiting && !(r.metadata?.return_code && r.metadata?.return_code_sent_at)
        return (
          <Link
            key={r.id}
            to={exchange ? `/degisimler/${r.id}` : `/iadeler/${r.id}`}
            className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-ui-bg-base-hover"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Text size="small" weight="plus">{exchange ? "Değişim" : "İade"}</Text>
                <Badge size="2xsmall" color={st.color}>{st.label}</Badge>
                {noCode ? <Badge size="2xsmall" color="red">İade kodu gitmedi</Badge> : null}
                <Text size="xsmall" className="text-ui-fg-subtle">{shortDate(r.created_at)}</Text>
              </div>
              <Text size="small" className="truncate text-ui-fg-subtle">
                {(r.items || [])
                  .map((it) => `${it.quantity} × ${(it.item_id && lineTitle.get(it.item_id)) || "Ürün"}`)
                  .join(", ")}
              </Text>
            </div>
            <TriangleRightMini className="shrink-0 text-ui-fg-muted" />
          </Link>
        )
      })}
      {canExchange ? (
        <div className="px-6 py-3">
          <ExchangePanel orderId={orderId} newOnly onCreated={(id) => navigate(`/degisimler/${id}`)} />
        </div>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  // Düzen kimliği: scripts/setup-admin-layouts.ts sıralamayı bununla yapar.
  id: "escay-order-returns",
  zone: "order.details.after",
})

export default OrderReturnsWidget
