import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Knex } from "@medusajs/framework/mikro-orm/knex"

/**
 * Admin: GET /admin/sales-stats?from=YYYY-MM-DD&to=YYYY-MM-DD&source=web
 *   &bucket=auto|hour|day|week|month   grafik kırılımı (auto: 1-2 gün saatlik, ≤92 gün günlük, değilse aylık)
 *   Grafik için önceki eşit dönem de aynı kırılımla döner (previous_series, sıra sırayla eşleşir).
 *   &group=product|variant&sort=quantity|revenue&limit=10..100&q=ürün/varyant adı   en çok satanlar
 *
 * Tek kanal (web). İleride pazaryeri eklenirse `source` ayrımı buradan genişletilir.
 *
 * Satış sayılan siparişler:
 * - Web (Medusa): iptal değil + ödenmiş (paid_total > 0). Ciro = ödenen − iade.
 *   Bekleyen havale / PayTR ödemesi satış sayılmaz, ayrıca `pending` olarak döner.
 *
 * Gün/hafta/ay sınırları Türkiye saatine göre (hafta pazartesi başlar).
 */
const TZ = "Europe/Istanbul"
const SOURCES = ["web"] as const
type Source = (typeof SOURCES)[number]
const DAY_MS = 86_400_000

const ORDERS_SQL = `
  select 'web' as source,
         o.id, o.created_at,
         coalesce((s.totals->>'paid_total')::numeric, 0) - coalesce((s.totals->>'refunded_total')::numeric, 0) as revenue
    from "order" o
    join order_summary s on s.order_id = o.id and s.version = o.version and s.deleted_at is null
   where o.deleted_at is null and o.is_draft_order = false and o.status <> 'canceled'
     and coalesce((s.totals->>'paid_total')::numeric, 0) > 0
`

const LINES_SQL = `
  select 'web' as source,
         o.id as order_id, o.created_at,
         coalesce(li.product_title, li.title) as product,
         li.variant_title as variant,
         li.thumbnail,
         oi.quantity as qty,
         coalesce(oi.unit_price, li.unit_price) * oi.quantity as revenue
    from "order" o
    join order_summary s on s.order_id = o.id and s.version = o.version and s.deleted_at is null
    join order_item oi on oi.order_id = o.id and oi.version = o.version and oi.deleted_at is null
    join order_line_item li on li.id = oi.item_id
   where o.deleted_at is null and o.is_draft_order = false and o.status <> 'canceled'
     and coalesce((s.totals->>'paid_total')::numeric, 0) > 0
`

type Range = { from: Date; to: Date }

function parseDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Türkiye saatiyle bugünün tarihi (YYYY-MM-DD). */
function todayTr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date())
}

/** Türkiye saatiyle [fromDay 00:00, toDay+1 00:00) aralığı. TR sabit UTC+3. */
function trRange(fromDay: string, toDay: string): Range {
  return {
    from: new Date(`${fromDay}T00:00:00+03:00`),
    to: new Date(`${addDays(toDay, 1)}T00:00:00+03:00`),
  }
}

type Bucket = "hour" | "day" | "week" | "month"
type Point = { date: string; orders: number; revenue: number }

/** Kırılım başlangıcı (hafta pazartesi, ay 1'i) — Postgres date_trunc ile aynı. */
function bucketStart(day: string, bucket: Bucket): string {
  if (bucket === "month") return `${day.slice(0, 8)}01`
  if (bucket === "week") return addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
  return day
}

/** Satış olmayan saatleri/günleri/haftaları/ayları 0 ile doldurur (grafikte boşluk kaybolmasın). */
function fillSeries(rows: Point[], fromDay: string, toDay: string, bucket: Bucket): Point[] {
  const byDate = new Map(rows.map((r) => [r.date, r]))
  const out: Point[] = []
  if (bucket === "hour") {
    for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
      for (let h = 0; h < 24; h++) {
        const key = `${day}T${String(h).padStart(2, "0")}`
        out.push(byDate.get(key) || { date: key, orders: 0, revenue: 0 })
      }
    }
    return out
  }
  let day = bucketStart(fromDay, bucket)
  while (day <= toDay && out.length < 1000) {
    out.push(byDate.get(day) || { date: day, orders: 0, revenue: 0 })
    day = bucket === "month"
      ? `${addDays(`${day.slice(0, 8)}28`, 4).slice(0, 8)}01`
      : addDays(day, bucket === "week" ? 7 : 1)
  }
  return out
}

function parseSource(value: unknown): Source {
  return (SOURCES as readonly string[]).includes(value as string) ? (value as Source) : "web"
}

async function summary(knex: Knex, range: Range, source: Source) {
  const { rows } = await knex.raw(
    `select count(*)::int as orders, coalesce(sum(revenue), 0)::float as revenue
       from (${ORDERS_SQL}) t
      where t.created_at >= :from and t.created_at < :to and t.source = :source`,
    { ...range, source }
  )
  const { rows: itemRows } = await knex.raw(
    `select coalesce(sum(qty), 0)::float as items
       from (${LINES_SQL}) t
      where t.created_at >= :from and t.created_at < :to and t.source = :source`,
    { ...range, source }
  )
  const orders = Number(rows[0]?.orders || 0)
  const revenue = Number(rows[0]?.revenue || 0)
  return {
    orders,
    revenue,
    items: Number(itemRows[0]?.items || 0),
    average: orders ? revenue / orders : 0,
  }
}

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const knex = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as Knex
  const q = req.query as Record<string, string | undefined>
  const today = todayTr()

  let toDay = parseDay(q.to) || today
  let fromDay = parseDay(q.from) || `${today.slice(0, 8)}01`
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay]
  const spanDays = Math.round((Date.parse(toDay) - Date.parse(fromDay)) / DAY_MS) + 1
  const source = parseSource(q.source)
  const group = q.group === "variant" ? "variant" : "product"
  const sort = q.sort === "revenue" ? "revenue" : "quantity"
  const limit = Math.min(100, Math.max(10, Number(q.limit) || 25))
  const search = (q.q || "").trim().slice(0, 100)
  const range = trRange(fromDay, toDay)
  const prevRange = trRange(addDays(fromDay, -spanDays), addDays(fromDay, -1))

  // Hızlı kutular: bugün, bu hafta (pazartesiden), bu ay
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
  const [current, previous, quickToday, quickWeek, quickMonth] = await Promise.all([
    summary(knex, range, source),
    summary(knex, prevRange, source),
    summary(knex, trRange(today, today), source),
    summary(knex, trRange(addDays(today, -weekday), today), source),
    summary(knex, trRange(`${today.slice(0, 8)}01`, today), source),
  ])

  // Grafik kırılımı; auto: 1-2 gün saatlik, 92 güne kadar günlük, daha uzunsa aylık
  const bucket: Bucket = ["hour", "day", "week", "month"].includes(q.bucket || "")
    ? (q.bucket as Bucket)
    : spanDays <= 2 ? "hour" : spanDays > 92 ? "month" : "day"
  // Saatlik kırılım en fazla 31 gün (744 nokta)
  const chartBucket: Bucket = bucket === "hour" && spanDays > 31 ? "day" : bucket
  const params = {
    ...range,
    source,
    tz: TZ,
    search: `%${search.replace(/[\\%_]/g, "\\$&")}%`,
  }
  const seriesSql = `
    select to_char(date_trunc('${chartBucket}', t.created_at at time zone :tz),
                   '${chartBucket === "hour" ? 'YYYY-MM-DD"T"HH24' : "YYYY-MM-DD"}') as date,
           count(*)::int as orders, coalesce(sum(revenue), 0)::float as revenue
      from (${ORDERS_SQL}) t
     where t.created_at >= :from and t.created_at < :to and t.source = :source
     group by 1 order by 1`
  const [series, prevSeries, top, pending] = await Promise.all([
    knex.raw(seriesSql, params),
    knex.raw(seriesSql, { ...params, ...prevRange }),
    knex.raw(
      `select min(t.product) as product,
              ${group === "variant" ? "min(t.variant)" : "null"} as variant,
              max(t.thumbnail) as thumbnail,
              sum(t.qty)::float as quantity,
              sum(t.revenue)::float as revenue,
              count(distinct t.order_id)::int as orders
         from (${LINES_SQL}) t
        where t.created_at >= :from and t.created_at < :to and t.source = :source
          ${search ? "and (t.product ilike :search or coalesce(t.variant, '') ilike :search)" : ""}
        group by lower(t.product)${group === "variant" ? ", lower(coalesce(t.variant, ''))" : ""}
        order by ${sort === "revenue" ? "revenue desc, quantity desc" : "quantity desc, revenue desc"}
        limit ${limit}`,
      params
    ),
    // Ödemesi beklenen web siparişleri (havale / PayTR) — aralıktan bağımsız, şu anki durum
    source !== "web" ? null : knex.raw(
      `select count(*)::int as orders,
              coalesce(sum((s.totals->>'current_order_total')::numeric), 0)::float as amount
         from "order" o
         join order_summary s on s.order_id = o.id and s.version = o.version and s.deleted_at is null
        where o.deleted_at is null and o.is_draft_order = false and o.status <> 'canceled'
          and coalesce((s.totals->>'paid_total')::numeric, 0) = 0`
    ),
  ])

  res.json({
    from: fromDay,
    to: toDay,
    source,
    previous: { from: addDays(fromDay, -spanDays), to: addDays(fromDay, -1), ...previous },
    current,
    quick: { today: quickToday, week: quickWeek, month: quickMonth },
    bucket: chartBucket,
    series: fillSeries(series.rows, fromDay, toDay, chartBucket),
    previous_series: fillSeries(prevSeries.rows, addDays(fromDay, -spanDays), addDays(fromDay, -1), chartBucket),
    top_products: top.rows,
    pending: pending ? pending.rows[0] || { orders: 0, amount: 0 } : null,
  })
}
