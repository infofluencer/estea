import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowUturnLeft } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useRef } from "react"
import { Link } from "react-router-dom"
import { formatEventDate } from "../../lib/ops-events"
import { useNavBadges } from "../../components/nav-badges"
import { usePersistedState, useScrollRestore } from "../../lib/persisted-state"

type ReturnState = "open" | "received" | "refunded" | "problem" | "rejected" | "canceled"
type BadgeColor = "green" | "orange" | "red" | "grey" | "blue"

type AdminReturn = {
  id: string
  state: ReturnState
  created_at: string
  order_id: string | null
  order_display_id: number | null
  customer: string
  email: string
  source: string | null
  customer_note: string | null
  tracking_number: string | null
  return_code: string | null
  exchange?: boolean
  refund_amount: number | null
  refund_error: string | null
  manual_required: boolean
  items: { title: string; quantity: number; received_quantity: number; reason: string | null }[]
}

type ReturnsResponse = {
  returns: AdminReturn[]
  counts: Record<ReturnState, number>
  total: number
}

const STATE: Record<ReturnState, { label: string; color: BadgeColor }> = {
  open: { label: "Bekliyor (paket gelmedi)", color: "orange" },
  received: { label: "Teslim alındı", color: "blue" },
  refunded: { label: "Para iade edildi", color: "green" },
  problem: { label: "Sorunlu", color: "red" },
  rejected: { label: "Reddedildi", color: "grey" },
  canceled: { label: "İptal", color: "grey" },
}

const FILTERS: { value: ReturnState | "all"; label: string }[] = [
  { value: "open", label: "Bekleyen" },
  { value: "problem", label: "Sorunlu" },
  { value: "received", label: "Teslim alındı" },
  { value: "refunded", label: "Para iade edildi" },
  { value: "rejected", label: "Reddedildi" },
  { value: "all", label: "Tümü" },
]

const SOURCE_LABEL: Record<string, string> = {
  customer: "Üye",
  guest: "Misafir",
  admin: "Panelden",
}

/**
 * Tüm iadeler tek listede. Teslim alma / reddetme sipariş sayfasından yapılır
 * (satıra tıklayınca açılır).
 */
const ReturnsPage = () => {
  useNavBadges()
  const [filter, setFilter] = usePersistedState<ReturnState | "all">("returns:filter", "open")

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["escay-returns"],
    queryFn: async () => {
      const res = await fetch(`/admin/escay-returns`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ReturnsResponse>
    },
  })

  const all = data?.returns || []
  const rows = filter === "all" ? all : all.filter((r) => r.state === filter)
  const counts = data?.counts
  const rootRef = useRef<HTMLDivElement>(null)
  useScrollRestore("returns", rootRef, !isLoading)

  return (
    <Container ref={rootRef} className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">İadeler</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Paket gelince siparişi açıp &quot;Ürünleri teslim al&quot; deyin; para iadesi otomatik başlar.
            Kabul edilmeyen iadeyi sipariş sayfasındaki &quot;İadeler&quot; kutusundan reddedin.
          </Text>
        </div>
        <Button size="small" variant="secondary" isLoading={isFetching} onClick={() => refetch()}>
          Yenile
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 px-6 py-3">
        {FILTERS.map((f) => {
          const n = f.value === "all" ? data?.total ?? 0 : counts?.[f.value] ?? 0
          return (
            <Button
              key={f.value}
              size="small"
              variant={filter === f.value ? "primary" : "transparent"}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({n})
            </Button>
          )
        })}
      </div>

      {isLoading ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Bu durumda iade yok.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tarih</Table.HeaderCell>
              <Table.HeaderCell>Sipariş</Table.HeaderCell>
              <Table.HeaderCell>Müşteri</Table.HeaderCell>
              <Table.HeaderCell>Ürünler / sebep</Table.HeaderCell>
              <Table.HeaderCell>Durum</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => {
              const st = STATE[r.state]
              return (
                <Table.Row key={r.id}>
                  <Table.Cell className="whitespace-nowrap">{formatEventDate(r.created_at)}</Table.Cell>
                  <Table.Cell>
                    {r.order_id ? (
                      <Link to={`/orders/${r.order_id}`} className="text-ui-fg-interactive">
                        #{r.order_display_id ?? r.order_id.slice(-6)}
                      </Link>
                    ) : "—"}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="txt-compact-small-plus">{r.customer || "—"}</div>
                    <div className="txt-compact-small text-ui-fg-subtle">
                      {r.source ? SOURCE_LABEL[r.source] || r.source : "Panelden"}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="max-w-[420px]">
                    {r.items.map((it, i) => (
                      <div key={i} className="txt-compact-small">
                        {it.quantity} × {it.title}
                        {it.reason ? <span className="text-ui-fg-subtle"> · {it.reason}</span> : null}
                      </div>
                    ))}
                    {r.customer_note ? (
                      <div className="txt-compact-small text-ui-fg-subtle">Not: {r.customer_note}</div>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={st.color}>
                      {r.state === "problem" && r.manual_required ? "Elle iade gerekli (havale)" : st.label}
                    </Badge>
                    {r.exchange ? (
                      <Badge size="2xsmall" color="blue" className="ml-1">Değişim</Badge>
                    ) : null}
                    {r.state === "refunded" && r.refund_amount != null ? (
                      <div className="txt-compact-small text-ui-fg-subtle">{r.refund_amount.toFixed(2)} TL</div>
                    ) : null}
                    {r.state === "problem" && !r.manual_required && r.refund_error ? (
                      <div className="txt-compact-small text-ui-fg-error">{r.refund_error}</div>
                    ) : null}
                    {r.state === "open" ? (
                      r.return_code ? (
                        <div className="txt-compact-small text-ui-fg-subtle">İade kodu: {r.return_code}</div>
                      ) : (
                        <div className="txt-compact-small text-ui-fg-error">İade kodu gönderilmedi</div>
                      )
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "İadeler",
  icon: ArrowUturnLeft,
})

export default ReturnsPage
