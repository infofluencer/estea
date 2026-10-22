import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BellAlert } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Select, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { fetchOpsEvents, formatEventDate, OPS_KIND_LABEL, OPS_LEVEL_BADGE } from "../../lib/ops-events"
import { useNavBadges } from "../../components/nav-badges"
import { usePersistedState, useScrollRestore } from "../../lib/persisted-state"

const PAGE_SIZE = 50

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tüm olaylar" },
  { value: "payment", label: "Ödeme" },
  { value: "order", label: "Sipariş iptali" },
  { value: "shipment", label: "Kargo" },
  { value: "return", label: "İade" },
  { value: "exchange", label: "Değişim" },
]

const LEVEL_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tüm seviyeler" },
  { value: "error", label: "Hata" },
  { value: "warning", label: "Uyarı" },
  { value: "info", label: "Bilgi" },
]

/**
 * Olay kaydı — PayTR ödeme başarılı/başarısız, 30 dk iptali, kargo gönderisi
 * açıldı/açılamadı, kargoya verildi/teslim, kargo sorunları. Mail gönderilmez.
 */
const OpsEventsPage = () => {
  useNavBadges()
  const [kind, setKind] = usePersistedState("ops-events:kind", "all")
  const [level, setLevel] = usePersistedState("ops-events:level", "all")
  const [page, setPage] = usePersistedState("ops-events:page", 0)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["escay-ops-events", kind, level, page],
    queryFn: () =>
      fetchOpsEvents({
        kind: kind === "all" ? undefined : kind,
        level: level === "all" ? undefined : level,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  })

  const events = data?.events || []
  const rootRef = useRef<HTMLDivElement>(null)
  useScrollRestore("ops-events", rootRef, !isLoading)

  const count = data?.count || 0
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  // Geri dönünce kayıtlı sayfa artık yoksa son sayfaya çek.
  useEffect(() => {
    if (data && page >= pages) setPage(pages - 1)
  }, [data, page, pages, setPage])

  return (
    <Container ref={rootRef} className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">Logs</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Ödeme, iptal, kargo ve iade olayları. Hatalar kırmızı etiketle işaretlenir.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => { setKind(v); setPage(0) }}>
            <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
            <Select.Content>
              {KIND_FILTERS.map((f) => <Select.Item key={f.value} value={f.value}>{f.label}</Select.Item>)}
            </Select.Content>
          </Select>
          <Select value={level} onValueChange={(v) => { setLevel(v); setPage(0) }}>
            <Select.Trigger className="w-40"><Select.Value /></Select.Trigger>
            <Select.Content>
              {LEVEL_FILTERS.map((f) => <Select.Item key={f.value} value={f.value}>{f.label}</Select.Item>)}
            </Select.Content>
          </Select>
          <Button size="small" variant="secondary" isLoading={isFetching} onClick={() => refetch()}>
            Yenile
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Yükleniyor…</Text>
      ) : events.length === 0 ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Kayıtlı olay yok.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Tarih</Table.HeaderCell>
              <Table.HeaderCell>Seviye</Table.HeaderCell>
              <Table.HeaderCell>Olay</Table.HeaderCell>
              <Table.HeaderCell>Sipariş</Table.HeaderCell>
              <Table.HeaderCell>Ayrıntı</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {events.map((e) => {
              const badge = OPS_LEVEL_BADGE[e.level] || OPS_LEVEL_BADGE.info
              return (
                <Table.Row key={e.id}>
                  <Table.Cell className="whitespace-nowrap">{formatEventDate(e.created_at)}</Table.Cell>
                  <Table.Cell><Badge size="2xsmall" color={badge.color}>{badge.label}</Badge></Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{OPS_KIND_LABEL[e.kind] || e.kind}</Table.Cell>
                  <Table.Cell>
                    {e.order_id ? (
                      <Link to={`/orders/${e.order_id}`} className="text-ui-fg-interactive">
                        #{e.order_display_id || e.order_id.slice(-6)}
                      </Link>
                    ) : "—"}
                  </Table.Cell>
                  <Table.Cell className="max-w-[520px]">
                    <div className="txt-compact-small-plus">{e.title}</div>
                    {e.detail ? (
                      <div className="txt-compact-small text-ui-fg-subtle whitespace-pre-wrap">{e.detail}</div>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}

      <div className="flex items-center justify-between px-6 py-3">
        <Text size="small" className="text-ui-fg-subtle">
          {count} olay · sayfa {page + 1}/{pages}
        </Text>
        <div className="flex gap-2">
          <Button size="small" variant="transparent" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Önceki
          </Button>
          <Button size="small" variant="transparent" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Sonraki
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Logs",
  icon: BellAlert,
})

export default OpsEventsPage
