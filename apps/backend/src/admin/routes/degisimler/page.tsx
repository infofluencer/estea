import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import { Badge, Button, Checkbox, Container, Heading, Table, Text, toast } from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { Link } from "react-router-dom"

import { EXCHANGE_STATE_BADGE, postJson } from "../../components/exchange-form"
import { formatEventDate } from "../../lib/ops-events"
import { usePersistedState, useScrollRestore } from "../../lib/persisted-state"
import { printExchangeLabels, skippedLabelsMessage } from "../../lib/print-labels"

type Row = {
  key: string
  kind: "medusa"
  state: keyof typeof EXCHANGE_STATE_BADGE
  requested_at: string
  order_label: string
  order_link: string
  customer: string
  source: string | null
  items: { quantity: number; title: string; from: string | null; to: string | null }[]
  shipment: { carrier: string | null; tracking_number: string | null } | null
  label_printed_at: string | null
  return_code: string | null
  error: string | null
  return_id: string | null
}

type Resp = { exchanges: Row[]; counts: Record<string, number>; total: number }

const FILTERS: { value: string; label: string; states: string[] }[] = [
  { value: "open", label: "Açık", states: ["awaiting_return", "to_ship", "failed", "label_ready"] },
  { value: "label_ready", label: "Etiket basılacak", states: ["label_ready"] },
  { value: "shipped", label: "Kargoda / teslim", states: ["shipped", "delivered"] },
  { value: "all", label: "Tümü", states: [] },
]

const SOURCE: Record<string, string> = { customer: "Üye", guest: "Misafir", admin: "Panelden" }

/**
 * Değişimler: tüm değişim talepleri tek listede. Etiketler
 * buradan toplu basılır; teslim alma sipariş sayfasından (İade kutusu).
 */
const ExchangesPage = () => {
  const qc = useQueryClient()
  const [filter, setFilter] = usePersistedState<string>("exchanges:filter", "open")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["escay-exchanges"],
    queryFn: async () => {
      const res = await fetch(`/admin/escay-exchanges`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<Resp>
    },
  })
  useScrollRestore("exchanges", rootRef, !isLoading)

  const all = data?.exchanges || []
  const states = FILTERS.find((f) => f.value === filter)?.states || []
  const rows = states.length ? all.filter((r) => states.includes(r.state)) : all
  const printable = rows.filter((r) => r.state === "label_ready")
  const picked = printable.filter((r) => selected.has(r.key))
  const countFor = (f: (typeof FILTERS)[number]) =>
    f.states.length ? f.states.reduce((s, st) => s + (data?.counts[st] || 0), 0) : data?.total || 0

  const print = async (keys: string[], withSlip: boolean) => {
    setBusy(withSlip ? "slip" : "label")
    try {
      const skipped = await printExchangeLabels(keys, withSlip)
      if (skipped.length) toast.warning(skippedLabelsMessage(skipped))
      setSelected(new Set())
      refetch()
    } catch (err) {
      toast.error((err as Error).message || "Etiket alınamadı")
    } finally {
      setBusy(null)
    }
  }
  const ship = async (r: Row) => {
    if (!r.return_id) return
    setBusy(`ship:${r.key}`)
    try {
      await postJson(`/admin/returns/${r.return_id}/exchange/ship`)
      toast.success("Yeni ürünün gönderisi açıldı")
      void qc.invalidateQueries({ queryKey: ["escay-exchanges"] })
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Container ref={rootRef} className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">Değişimler</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Ürün gelince siparişi açıp teslim alın; yeni ürünün gönderisi açılır ve etiketi buradan basılır. Değişimde para
            iadesi yapılmaz.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {printable.length ? (
            <>
              <Button size="small" variant="primary" isLoading={busy === "slip"} disabled={busy !== null || !picked.length} onClick={() => print(picked.map((r) => r.key), true)}>
                Etiket + fiş ({picked.length})
              </Button>
              <Button size="small" variant="secondary" isLoading={busy === "label"} disabled={busy !== null || !picked.length} onClick={() => print(picked.map((r) => r.key), false)}>
                Fişsiz ({picked.length})
              </Button>
            </>
          ) : null}
          <Button size="small" variant="secondary" isLoading={isFetching} onClick={() => refetch()}>
            Yenile
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-6 py-3">
        {FILTERS.map((f) => (
          <Button key={f.value} size="small" variant={filter === f.value ? "primary" : "transparent"} onClick={() => setFilter(f.value)}>
            {f.label} ({countFor(f)})
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Bu durumda değişim yok.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell className="w-8">
                {printable.length ? (
                  <Checkbox
                    checked={picked.length > 0 && picked.length === printable.length}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(printable.map((r) => r.key)) : new Set())}
                  />
                ) : null}
              </Table.HeaderCell>
              <Table.HeaderCell>Tarih</Table.HeaderCell>
              <Table.HeaderCell>Sipariş</Table.HeaderCell>
              <Table.HeaderCell>Müşteri</Table.HeaderCell>
              <Table.HeaderCell>Değişim</Table.HeaderCell>
              <Table.HeaderCell>Durum</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => {
              const st = EXCHANGE_STATE_BADGE[r.state]
              return (
                <Table.Row key={r.key}>
                  <Table.Cell>
                    {r.state === "label_ready" ? (
                      <Checkbox
                        checked={selected.has(r.key)}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev)
                            if (v === true) next.add(r.key)
                            else next.delete(r.key)
                            return next
                          })
                        }
                      />
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{formatEventDate(r.requested_at)}</Table.Cell>
                  <Table.Cell>
                    <Link to={r.order_link} className="text-ui-fg-interactive">{r.order_label}</Link>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="txt-compact-small-plus">{r.customer || "—"}</div>
                    <div className="txt-compact-small text-ui-fg-subtle">{r.source ? SOURCE[r.source] || r.source : "Panelden"}</div>
                  </Table.Cell>
                  <Table.Cell className="max-w-[420px]">
                    {r.items.map((it, i) => (
                      <div key={i} className="txt-compact-small">
                        {it.quantity} × {it.title}
                        {it.from ? ` ${it.from}` : ""} → <strong>{it.to || "?"}</strong>
                      </div>
                    ))}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={st.color}>{st.label}</Badge>
                    {r.state === "awaiting_return" ? (
                      <div className={`txt-compact-small ${r.return_code ? "text-ui-fg-subtle" : "text-ui-fg-error"}`}>
                        {r.return_code ? `İade kodu: ${r.return_code}` : "İade kodu gönderilmedi"}
                      </div>
                    ) : null}
                    {r.shipment?.tracking_number ? (
                      <div className="txt-compact-small text-ui-fg-subtle">Takip: {r.shipment.tracking_number}</div>
                    ) : null}
                    {r.label_printed_at ? (
                      <div className="txt-compact-small text-ui-fg-subtle">Etiket basıldı {formatEventDate(r.label_printed_at)}</div>
                    ) : null}
                    {r.error ? <div className="txt-compact-small text-ui-fg-error">{r.error}</div> : null}
                  </Table.Cell>
                  <Table.Cell>
                    {r.state === "label_ready" ? (
                      <Button size="small" variant="secondary" disabled={busy !== null} onClick={() => print([r.key], true)}>
                        Etiket
                      </Button>
                    ) : (r.state === "to_ship" || r.state === "failed") && r.kind === "medusa" ? (
                      <Button size="small" variant="secondary" isLoading={busy === `ship:${r.key}`} disabled={busy !== null} onClick={() => ship(r)}>
                        Yeni ürünü gönder
                      </Button>
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
  label: "Değişimler",
  icon: ArrowPath,
})

export default ExchangesPage
