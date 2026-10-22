import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Select, Table, Tabs, Text } from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { type ChartBucket, type ChartPoint, SalesChart } from "../../components/sales-chart"
import { useNavBadges } from "../../components/nav-badges"
import { usePersistedState } from "../../lib/persisted-state"

type Summary = { orders: number; revenue: number; items: number; average: number }
type TopProduct = {
  product: string
  variant: string | null
  thumbnail: string | null
  quantity: number
  revenue: number
  orders: number
}
type Stats = {
  from: string
  to: string
  source: Source
  previous: Summary & { from: string; to: string }
  current: Summary
  quick: { today: Summary; week: Summary; month: Summary }
  bucket: ChartBucket
  series: ChartPoint[]
  previous_series: ChartPoint[]
  top_products: TopProduct[]
  pending: { orders: number; amount: number } | null
}

type Source = "web"

/** Tek kanal; pazaryeri eklenirse buraya sekme eklenir. */
const SOURCES: { value: Source; label: string; note: string }[] = [
  { value: "web", label: "Web sitesi", note: "Ödenmiş siparişler. İptal ve ödemesi bekleyenler hariç." },
]

const PRESETS = [
  { value: "today", label: "Bugün" },
  { value: "yesterday", label: "Dün" },
  { value: "week", label: "Bu hafta" },
  { value: "lastWeek", label: "Geçen hafta" },
  { value: "last7", label: "Son 7 gün" },
  { value: "month", label: "Bu ay" },
  { value: "lastMonth", label: "Geçen ay" },
  { value: "last30", label: "Son 30 gün" },
  { value: "last3m", label: "Son 3 ay" },
  { value: "last6m", label: "Son 6 ay" },
  { value: "last12m", label: "Son 1 yıl" },
  { value: "year", label: "Bu yıl" },
  { value: "lastYear", label: "Geçen yıl" },
  { value: "custom", label: "Özel aralık" },
]

const BUCKETS = [
  { value: "auto", label: "Otomatik" },
  { value: "hour", label: "Saatlik" },
  { value: "day", label: "Günlük" },
  { value: "week", label: "Haftalık" },
  { value: "month", label: "Aylık" },
]

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })
const num = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 })

function trToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date())
}

function shift(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

function weekStart(day: string): string {
  return shift(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
}

/** n ay önceki aynı günün ertesi (12 Eki, 3 ay → 13 Tem); ay sonu taşmasında ayın son günü. */
function monthsBack(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number)
  const lastDay = new Date(Date.UTC(y, m - 1 - n + 1, 0)).getUTCDate()
  const base = new Date(Date.UTC(y, m - 1 - n, Math.min(d, lastDay))).toISOString().slice(0, 10)
  return shift(base, 1)
}

function presetRange(preset: string): { from: string; to: string } {
  const today = trToday()
  const monthStart = `${today.slice(0, 8)}01`
  const year = Number(today.slice(0, 4))
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday":
      return { from: shift(today, -1), to: shift(today, -1) }
    case "week":
      return { from: weekStart(today), to: today }
    case "lastWeek": {
      const start = shift(weekStart(today), -7)
      return { from: start, to: shift(start, 6) }
    }
    case "last7":
      return { from: shift(today, -6), to: today }
    case "lastMonth": {
      const end = shift(monthStart, -1)
      return { from: `${end.slice(0, 8)}01`, to: end }
    }
    case "last30":
      return { from: shift(today, -29), to: today }
    case "last3m":
      return { from: monthsBack(today, 3), to: today }
    case "last6m":
      return { from: monthsBack(today, 6), to: today }
    case "last12m":
      return { from: monthsBack(today, 12), to: today }
    case "year":
      return { from: `${year}-01-01`, to: today }
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
    default:
      return { from: monthStart, to: today }
  }
}

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", timeZone: "UTC" })
}

async function fetchStats(params: Record<string, string>): Promise<Stats> {
  const res = await fetch(`/admin/sales-stats?${new URLSearchParams(params).toString()}`, { credentials: "include" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function downloadCsv(rows: TopProduct[], name: string) {
  const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const lines = [
    ["Sıra", "Ürün", "Varyant", "Adet", "Sipariş", "Ciro (TL)"].map(esc).join(";"),
    ...rows.map((p, i) =>
      [i + 1, p.product, p.variant, p.quantity, p.orders, p.revenue.toFixed(2).replace(".", ",")].map(esc).join(";")
    ),
  ]
  // BOM: Excel Türkçe karakterleri doğru açsın
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const Change = ({ current, previous }: { current: number; previous: number }) => {
  if (!previous) return null
  const pct = ((current - previous) / previous) * 100
  const color = pct > 0.5 ? "green" : pct < -0.5 ? "red" : "grey"
  return (
    <Badge size="2xsmall" color={color}>
      {pct > 0 ? "+" : ""}
      {pct.toFixed(0)}%
    </Badge>
  )
}

const QuickCard = ({ label, s }: { label: string; s?: Summary }) => (
  <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <div className="txt-compact-xlarge-plus mt-1">{s ? money.format(s.revenue) : "—"}</div>
    <Text size="small" className="text-ui-fg-muted">
      {s ? `${num.format(s.orders)} sipariş · ${num.format(s.items)} ürün` : ""}
    </Text>
  </div>
)

const Metric = ({ label, value, current, previous }: { label: string; value: string; current: number; previous: number }) => (
  <div className="px-6 py-4">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <div className="mt-1 flex items-center gap-2">
      <span className="txt-compact-xlarge-plus">{value}</span>
      <Change current={current} previous={previous} />
    </div>
  </div>
)

/**
 * Satış istatistikleri — web kanalı
 * bugün / hafta / ay özetleri, seçilen aralıkta ciro, sipariş, ortalama sepet
 * (önceki eşit dönemle kıyas), grafik ve en çok satan ürünler.
 * Kaynak: GET /admin/sales-stats
 */
const SalesStatsPage = () => {
  useNavBadges()
  const [source, setSource] = usePersistedState<Source>("sales-stats:source", "web")
  const [preset, setPreset] = usePersistedState("sales-stats:preset", "month")
  const [custom, setCustom] = usePersistedState("sales-stats:custom", () => presetRange("month"))
  const [bucket, setBucket] = usePersistedState("sales-stats:bucket", "auto")
  const [metric, setMetric] = usePersistedState<"revenue" | "orders">("sales-stats:metric", "revenue")
  const [group, setGroup] = usePersistedState("sales-stats:group", "product")
  const [sort, setSort] = usePersistedState("sales-stats:sort", "quantity")
  const [limit, setLimit] = usePersistedState("sales-stats:limit", "25")
  const [search, setSearch] = usePersistedState("sales-stats:search", "")
  const [debouncedSearch, setDebouncedSearch] = useState(() => search.trim())

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const range = preset === "custom" ? custom : presetRange(preset)

  const setCustomDay = (key: "from" | "to", value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const next = { ...range, [key]: value }
    // Ters seçilirse diğer ucu da taşı
    if (next.from > next.to) key === "from" ? (next.to = value) : (next.from = value)
    setCustom(next)
    setPreset("custom")
  }
  const params = { from: range.from, to: range.to, source, bucket, group, sort, limit, q: debouncedSearch }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["escay-sales-stats", params],
    queryFn: () => fetchStats(params),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Heading level="h1">Satış İstatistikleri</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {SOURCES.find((s) => s.value === source)?.note}
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={source} onValueChange={(v) => setSource(v as Source)}>
              <Tabs.List>
                {SOURCES.map((s) => <Tabs.Trigger key={s.value} value={s.value}>{s.label}</Tabs.Trigger>)}
              </Tabs.List>
            </Tabs>
            <Button size="small" variant="secondary" isLoading={isFetching} onClick={() => refetch()}>
              Yenile
            </Button>
          </div>
        </div>
        <div className={`grid grid-cols-1 gap-3 px-6 py-4 ${source === "web" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <QuickCard label="Bugün" s={data?.quick.today} />
          <QuickCard label="Bu hafta" s={data?.quick.week} />
          <QuickCard label="Bu ay" s={data?.quick.month} />
          {source === "web" ? (
            <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle px-4 py-3">
              <Text size="small" className="text-ui-fg-subtle">Ödeme bekleyen</Text>
              <div className="txt-compact-xlarge-plus mt-1">{data?.pending ? money.format(data.pending.amount) : "—"}</div>
              <Text size="small" className="text-ui-fg-muted">
                {data?.pending ? `${num.format(data.pending.orders)} sipariş · havale / PayTR` : ""}
              </Text>
            </div>
          ) : null}
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Heading level="h2">Dönem</Heading>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={preset}
              onValueChange={(v) => {
                if (v === "custom") setCustom(range)
                setPreset(v)
              }}
            >
              <Select.Trigger className="w-40"><Select.Value /></Select.Trigger>
              <Select.Content>
                {PRESETS.map((p) => <Select.Item key={p.value} value={p.value}>{p.label}</Select.Item>)}
              </Select.Content>
            </Select>
            {/* Tarih kutuları her zaman görünür; değiştirince "Özel aralık"a geçer */}
            <Input
              type="date"
              size="small"
              className="w-40"
              aria-label="Başlangıç tarihi"
              value={range.from}
              max={range.to}
              onChange={(e) => setCustomDay("from", e.target.value)}
            />
            <Text size="small" className="text-ui-fg-subtle">–</Text>
            <Input
              type="date"
              size="small"
              className="w-40"
              aria-label="Bitiş tarihi"
              value={range.to}
              min={range.from}
              max={trToday()}
              onChange={(e) => setCustomDay("to", e.target.value)}
            />
          </div>
        </div>

        {isError ? (
          <Text size="small" className="px-6 py-4 text-ui-fg-error">İstatistikler alınamadı.</Text>
        ) : isLoading || !data ? (
          <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Yükleniyor…</Text>
        ) : (
          <>
            <div className="grid grid-cols-2 divide-x md:grid-cols-4">
              <Metric label="Ciro" value={money.format(data.current.revenue)} current={data.current.revenue} previous={data.previous.revenue} />
              <Metric label="Sipariş" value={num.format(data.current.orders)} current={data.current.orders} previous={data.previous.orders} />
              <Metric label="Satılan ürün" value={num.format(data.current.items)} current={data.current.items} previous={data.previous.items} />
              <Metric label="Ortalama sepet" value={money.format(data.current.average)} current={data.current.average} previous={data.previous.average} />
            </div>
            <Text size="xsmall" className="px-6 py-2 text-ui-fg-muted">
              Yüzdeler önceki eşit dönemle kıyas: {formatDay(data.previous.from)} – {formatDay(data.previous.to)}
              {" "}({money.format(data.previous.revenue)}, {num.format(data.previous.orders)} sipariş)
            </Text>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-4">
              <Heading level="h3">{metric === "revenue" ? "Ciro" : "Sipariş sayısı"} grafiği</Heading>
              <div className="flex flex-wrap items-center gap-2">
              <Select value={metric} onValueChange={(v) => setMetric(v as "revenue" | "orders")}>
                <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="revenue">Ciro</Select.Item>
                  <Select.Item value="orders">Sipariş sayısı</Select.Item>
                </Select.Content>
              </Select>
              <Select value={bucket} onValueChange={setBucket}>
                <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
                <Select.Content>
                  {BUCKETS.map((b) => <Select.Item key={b.value} value={b.value}>{b.label}</Select.Item>)}
                </Select.Content>
              </Select>
              </div>
            </div>
            <SalesChart series={data.series} previous={data.previous_series} bucket={data.bucket} metric={metric} />
          </>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Heading level="h2">En çok satan ürünler</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Seçili kanal ve dönemde, {sort === "revenue" ? "ciroya" : "satılan adede"} göre ilk {limit}.
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              size="small"
              className="w-48"
              placeholder="Ürün veya renk ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={group} onValueChange={setGroup}>
              <Select.Trigger className="w-40"><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="product">Ürün bazında</Select.Item>
                <Select.Item value="variant">Renk / varyant</Select.Item>
              </Select.Content>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
              <Select.Content>
                <Select.Item value="quantity">Adede göre</Select.Item>
                <Select.Item value="revenue">Ciroya göre</Select.Item>
              </Select.Content>
            </Select>
            <Select value={limit} onValueChange={setLimit}>
              <Select.Trigger className="w-28"><Select.Value /></Select.Trigger>
              <Select.Content>
                {["10", "25", "50", "100"].map((n) => <Select.Item key={n} value={n}>İlk {n}</Select.Item>)}
              </Select.Content>
            </Select>
            <Button
              size="small"
              variant="secondary"
              disabled={!data?.top_products.length}
              onClick={() => data && downloadCsv(data.top_products, `en-cok-satanlar-${source}-${data.from}-${data.to}.csv`)}
            >
              CSV indir
            </Button>
          </div>
        </div>
        {!data || data.top_products.length === 0 ? (
          <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
            {isLoading ? "Yükleniyor…" : debouncedSearch ? "Aramaya uyan satış yok." : "Bu aralıkta satış yok."}
          </Text>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>#</Table.HeaderCell>
                <Table.HeaderCell>Ürün</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Adet</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Sipariş</Table.HeaderCell>
                <Table.HeaderCell className="text-right">Ciro</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.top_products.map((p, i) => (
                <Table.Row key={`${p.product}|${p.variant || ""}`}>
                  <Table.Cell className="text-ui-fg-subtle">{i + 1}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-ui-bg-component" />
                      )}
                      <div>
                        <div className="txt-compact-small-plus">{p.product}</div>
                        {p.variant ? <div className="txt-compact-small text-ui-fg-subtle">{p.variant}</div> : null}
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="text-right">{num.format(p.quantity)}</Table.Cell>
                  <Table.Cell className="text-right">{num.format(p.orders)}</Table.Cell>
                  <Table.Cell className="text-right">{money.format(p.revenue)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Satış İstatistikleri",
  icon: ChartBar,
  rank: 0,
})

export default SalesStatsPage
