import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Checkbox, Container, Heading, Select, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ORDER_STATUS_BADGE, resolveOrderTimeline, type OrderTimelineInput } from "../lib/order-timeline"
import { printOrderLabels, skippedLabelsMessage } from "../lib/print-labels"
import { usePersistedState, useScrollRestore } from "../lib/persisted-state"

type ListFulfillment = {
  id?: string
  shipped_at?: string | null
  delivered_at?: string | null
  canceled_at?: string | null
  data?: Record<string, unknown> | null
}

type ListOrder = Omit<OrderTimelineInput, "fulfillments"> & {
  fulfillments?: ListFulfillment[] | null
  id: string
  display_id?: number | null
  created_at?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
  shipping_address?: { first_name?: string | null; last_name?: string | null; city?: string | null } | null
}

type Filter = "to_ship" | "bank_transfer" | "all"
type LabelFilter = "any" | "not_printed" | "printed"

const LABEL_FILTERS: { value: LabelFilter; label: string }[] = [
  { value: "any", label: "Tümü" },
  { value: "not_printed", label: "Yazdırılmadı" },
  { value: "printed", label: "Yazdırıldı" },
]

type PaymentFilter = "any" | "paid" | "pending" | "canceled"
type ShipFilter = "any" | "none" | "label" | "shipped" | "delivered"

/** "Yeniden gönderi aç" butonu (2 desi geçişinde kullanıldı) — gizli. */
const SHOW_RESHIP = false

const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "any", label: "Ödeme: tümü" },
  { value: "paid", label: "Ödeme alındı" },
  { value: "pending", label: "Ödeme bekliyor" },
  { value: "canceled", label: "İptal edildi" },
]

const SHIP_FILTERS: { value: ShipFilter; label: string }[] = [
  { value: "any", label: "Kargo: tümü" },
  { value: "none", label: "Gönderi yok" },
  { value: "label", label: "Etiket hazır (kurye bekleniyor)" },
  { value: "shipped", label: "Kargoda" },
  { value: "delivered", label: "Teslim edildi" },
]

/** Ödeme durumu: iptal → alındı (tahsil/onay) → bekliyor. */
function paymentState(order: ListOrder, canceled: boolean): Exclude<PaymentFilter, "any"> {
  if (canceled || order.status === "canceled") return "canceled"
  const paid = (order.payment_collections || []).some((pc) => {
    const st = (pc.status || "").toLowerCase()
    return st === "completed" || st === "authorized" || st === "captured"
  })
  return paid ? "paid" : "pending"
}

/** Kargo durumu: aktif (iptal edilmemiş) gönderiye göre. */
function shipState(order: ListOrder): Exclude<ShipFilter, "any"> {
  const active = (order.fulfillments || []).find((f) => !f.canceled_at)
  if (!active) return "none"
  if (active.delivered_at) return "delivered"
  if (active.shipped_at) return "shipped"
  return "label"
}

/** Kargo etiketi en son ne zaman basıldı (`metadata.label_printed_at`). */
function labelPrintedAt(order: ListOrder): string | null {
  const value = order.metadata?.label_printed_at
  return typeof value === "string" && value ? value : null
}

const LIST_LIMIT = 100

const FIELDS = [
  "id",
  "display_id",
  "created_at",
  "email",
  "status",
  "metadata",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.city",
  "payment_collections.status",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.data",
].join(",")

type BadgeColor = "green" | "blue" | "orange" | "red" | "grey" | "purple"

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Kargo durumu: Medusa fulfillment (kargoda / teslim) önce, yoksa firmanın son
 * bildirdiği durum (normalize data.status). Takip no varsa altına yazılır.
 */
function shippingStatus(order: ListOrder): {
  label: string
  color: BadgeColor
  detail: string
} {
  const active = (order.fulfillments || []).find((f) => !f.canceled_at)
  if (!active) return { label: "Gönderi yok", color: "grey", detail: "" }
  const data = active.data || {}
  const tracking = text(data.tracking_number) || text(data.barcode)
  const carrierStatus = text(data.status) || text(data.status_code)
  if (active.delivered_at) return { label: "Teslim edildi", color: "green", detail: tracking }
  if (active.shipped_at) {
    return { label: "Kargoda", color: "blue", detail: [carrierStatus, tracking].filter(Boolean).join(" · ") }
  }
  if (text(data.carrier) === "manual" || !text(data.shipment_ref)) {
    return { label: "Hazırlanıyor", color: "orange", detail: tracking }
  }
  if (carrierStatus) return { label: carrierStatus, color: "blue", detail: tracking }
  return { label: text(data.label_url) ? "Etiket hazır" : "Gönderi açıldı", color: text(data.label_url) ? "blue" : "orange", detail: tracking }
}

/**
 * Havale / EFT siparişi, para henüz admin'den onaylanmadı. Ödeme durumuna
 * doğrudan bakar — elle fulfillment açılmış olsa da yakalanır.
 */
function awaitingBankTransfer(order: ListOrder): boolean {
  if (order.metadata?.payment_method !== "bank_transfer") return false
  return !(order.payment_collections || []).some((pc) => {
    const st = (pc.status || "").toLowerCase()
    return st === "completed" || st === "authorized" || st === "captured"
  })
}

function formatDate(value?: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Sipariş listesi — kargolanacak siparişlerin sipariş/kargo etiketlerini toplu yazdır.
 */
const OrderBulkLabelsWidget = () => {
  const [filter, setFilter] = usePersistedState<Filter>("bulk-labels:filter", "to_ship")
  const [labelFilter, setLabelFilter] = usePersistedState<LabelFilter>("bulk-labels:label", "any")
  const [paymentFilter, setPaymentFilter] = usePersistedState<PaymentFilter>("bulk-labels:payment", "any")
  const [shipFilter, setShipFilter] = usePersistedState<ShipFilter>("bulk-labels:ship", "any")
  const [selected, setSelected] = usePersistedState<Set<string>>("bulk-labels:selected", () => new Set())
  const [busy, setBusy] = useState<"label" | "slip" | "reship" | "ship" | "deliver" | null>(null)
  const [reshipProgress, setReshipProgress] = useState("")
  const [statusProgress, setStatusProgress] = useState("")
  const [open, setOpen] = usePersistedState("bulk-labels:open", false)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["escay-bulk-labels"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders?fields=${FIELDS}&order=-created_at&limit=${LIST_LIMIT}`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{ orders: ListOrder[] }>
    },
  })

  // Sipariş listesi sayfasının kaydırma konumu (widget kapalıyken de Medusa tablosu için).
  const rootRef = useRef<HTMLDivElement>(null)
  useScrollRestore("orders-list", rootRef, !open || !isLoading)

  const rows = useMemo(() => {
    return (data?.orders || [])
      .map((order) => ({ order, timeline: resolveOrderTimeline(order as OrderTimelineInput) }))
      // İptal edilenler yalnız "Son 100 sipariş" kapsamında (ödeme filtresiyle bulunabilsin).
      .filter(({ timeline }) => filter === "all" || !timeline.canceled)
      .filter(({ order, timeline }) => {
        if (filter === "all") return true
        if (filter === "bank_transfer") return awaitingBankTransfer(order)
        return (
          (timeline.currentKey === "preparing" || timeline.currentKey === "prepared") &&
          !awaitingBankTransfer(order)
        )
      })
      .filter(({ order }) => {
        if (labelFilter === "any") return true
        return labelFilter === "printed" ? Boolean(labelPrintedAt(order)) : !labelPrintedAt(order)
      })
      .filter(({ order, timeline }) => paymentFilter === "any" || paymentState(order, timeline.canceled) === paymentFilter)
      .filter(({ order }) => shipFilter === "any" || shipState(order) === shipFilter)
  }, [data, filter, labelFilter, paymentFilter, shipFilter])

  // Parası gelmemiş havale siparişine etiket basılmaz.
  const visibleIds = rows
    .filter((r) => !awaitingBankTransfer(r.order) && !r.timeline.canceled)
    .map((r) => r.order.id)
  const selectedIds = visibleIds.filter((id) => selected.has(id))
  const allSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleIds))

  const print = async (withSlip: boolean) => {
    if (!selectedIds.length) return
    setBusy(withSlip ? "slip" : "label")
    try {
      const skipped = await printOrderLabels(selectedIds, withSlip)
      if (skipped.length) toast.warning(skippedLabelsMessage(skipped))
      // "Etiket yazdırıldı" rozetleri güncellensin.
      refetch()
    } catch (err) {
      toast.error((err as Error).message || "Etiketler alınamadı")
    } finally {
      setBusy(null)
    }
  }

  /**
   * Seçili siparişlerin gönderisini firmada iptal edip yeniden aç.
   * Sırayla; hata veren (firma iptali reddeden) sipariş atlanır, sonda raporlanır.
   */
  const reship = async () => {
    const targets = rows.filter((r) => selectedIds.includes(r.order.id)).map((r) => r.order)
    if (!targets.length) return
    const ok = window.confirm(
      `${targets.length} siparişin mevcut kargo gönderisi İPTAL edilip YENİ gönderi açılacak ` +
        `(yeni barkod, yeni kargo ücreti). Eski etiketler geçersiz olur, yeniden basılmalı. ` +
        `Kuryenin almadığı paketler için yapın. Devam?`
    )
    if (!ok) return
    setBusy("reship")
    const failed: string[] = []
    let done = 0
    for (const order of targets) {
      setReshipProgress(`${done + 1}/${targets.length} · #${order.display_id ?? order.id}`)
      try {
        const res = await fetch(`/admin/orders/${order.id}/fulfillment/reship`, {
          method: "POST",
          credentials: "include",
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.message || `HTTP ${res.status}`)
        }
        done++
        // Tekrar tıklanınca aynı gönderi yeniden açılmasın; hatalılar seçili kalır.
        setSelected((prev) => {
          const next = new Set(prev)
          next.delete(order.id)
          return next
        })
      } catch (err) {
        failed.push(`#${order.display_id ?? order.id}: ${(err as Error).message}`)
      }
    }
    setBusy(null)
    setReshipProgress("")
    refetch()
    if (done) toast.success(`${done} sipariş için yeni gönderi açıldı. Etiketleri yeniden yazdırın.`)
    if (failed.length) toast.error(`Yeniden açılamadı (${failed.length}): ${failed.join(" | ")}`, { duration: 60000 })
  }

  /**
   * Sisteme düşmeden kargolanan (şubede elle verilen) siparişleri
   * düzeltir: sırayla "Kargoya verildi" / "Teslim edildi", müşteriye mail gitmez.
   */
  const markStatus = async (action: "ship" | "deliver") => {
    const targets = rows.filter((r) => selectedIds.includes(r.order.id)).map((r) => r.order)
    if (!targets.length) return
    const label = action === "deliver" ? "Teslim edildi" : "Kargoya verildi"
    const ok = window.confirm(
      `${targets.length} sipariş "${label}" olarak işaretlenecek. Müşteriye mail GÖNDERİLMEZ. ` +
        `Yalnız gerçekten ${action === "deliver" ? "teslim edilmiş" : "kargoya verilmiş"} siparişler için yapın. Devam?`
    )
    if (!ok) return
    setBusy(action)
    const failed: string[] = []
    let done = 0
    for (const order of targets) {
      setStatusProgress(`${label}: ${done + failed.length + 1}/${targets.length} · #${order.display_id ?? order.id}`)
      try {
        const res = await fetch(`/admin/orders/${order.id}/escay-status`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, notify: false }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.message || `HTTP ${res.status}`)
        }
        done++
      } catch (err) {
        failed.push(`#${order.display_id ?? order.id}: ${(err as Error).message}`)
      }
    }
    setBusy(null)
    setStatusProgress("")
    setSelected(new Set())
    refetch()
    if (done) toast.success(`${done} sipariş "${label}" yapıldı (mail gönderilmedi).`)
    if (failed.length) toast.error(`İşaretlenemedi (${failed.length}): ${failed.join(" | ")}`, { duration: 60000 })
  }

  return (
    <Container ref={rootRef} className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Etiketleri toplu yazdır</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Kargo firmasının etiketi (geldiği gibi), istenirse arkasında sipariş fişi.
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Kapat" : "Sipariş seç"}
        </Button>
      </div>

      {open ? (
        <>
          <div className="flex flex-wrap items-center gap-2 px-6 py-3">
            <Button
              size="small"
              variant={filter === "to_ship" ? "primary" : "transparent"}
              onClick={() => setFilter("to_ship")}
            >
              Kargolanacaklar
            </Button>
            <Button
              size="small"
              variant={filter === "bank_transfer" ? "primary" : "transparent"}
              onClick={() => setFilter("bank_transfer")}
            >
              Havale bekleyenler
            </Button>
            <Button
              size="small"
              variant={filter === "all" ? "primary" : "transparent"}
              onClick={() => setFilter("all")}
            >
              Son {LIST_LIMIT} sipariş
            </Button>
            <Button
              size="small"
              variant="transparent"
              isLoading={isFetching}
              onClick={() => refetch()}
            >
              Yenile
            </Button>
            <span className="ml-2 txt-compact-small text-ui-fg-subtle">Etiket:</span>
            {LABEL_FILTERS.map((f) => (
              <Button
                key={f.value}
                size="small"
                variant={labelFilter === f.value ? "secondary" : "transparent"}
                onClick={() => setLabelFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
            <div className="w-40">
              <Select size="small" value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as PaymentFilter)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {PAYMENT_FILTERS.map((f) => (
                    <Select.Item key={f.value} value={f.value}>
                      {f.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="w-56">
              <Select size="small" value={shipFilter} onValueChange={(v) => setShipFilter(v as ShipFilter)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {SHIP_FILTERS.map((f) => (
                    <Select.Item key={f.value} value={f.value}>
                      {f.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
            <div className="ml-auto flex gap-2">
              <Button
                size="small"
                variant="primary"
                disabled={!selectedIds.length || busy !== null}
                isLoading={busy === "slip"}
                onClick={() => print(true)}
              >
                Etiket + fiş ({selectedIds.length})
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={!selectedIds.length || busy !== null}
                isLoading={busy === "label"}
                onClick={() => print(false)}
              >
                Fişsiz ({selectedIds.length})
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={!selectedIds.length || busy !== null}
                isLoading={busy === "ship"}
                onClick={() => markStatus("ship")}
              >
                Kargoya verildi ({selectedIds.length})
              </Button>
              <Button
                size="small"
                variant="secondary"
                disabled={!selectedIds.length || busy !== null}
                isLoading={busy === "deliver"}
                onClick={() => markStatus("deliver")}
              >
                Teslim edildi ({selectedIds.length})
              </Button>
              {/* "Yeniden gönderi aç" gizli (2026-10-14, kullanıcı isteği) — gerekirse SHOW_RESHIP = true. */}
              {SHOW_RESHIP ? (
              <Button
                size="small"
                variant="danger"
                disabled={!selectedIds.length || busy !== null}
                isLoading={busy === "reship"}
                onClick={reship}
              >
                Yeniden gönderi aç ({selectedIds.length})
              </Button>
              ) : null}
            </div>
          </div>

          {statusProgress ? (
            <Text size="small" className="px-6 py-2 text-ui-fg-subtle">
              {statusProgress} — sayfayı kapatmayın.
            </Text>
          ) : null}
          {reshipProgress ? (
            <Text size="small" className="px-6 py-2 text-ui-fg-subtle">
              Gönderiler yeniden açılıyor: {reshipProgress} — sayfayı kapatmayın.
            </Text>
          ) : null}
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
                Siparişler yükleniyor…
              </Text>
            ) : rows.length === 0 ? (
              <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
                {labelFilter !== "any" || paymentFilter !== "any" || shipFilter !== "any"
                  ? "Bu filtrelerle eşleşen sipariş yok."
                  : filter === "to_ship"
                  ? "Kargolanacak sipariş yok."
                  : filter === "bank_transfer"
                    ? `Ödemesi beklenen havale siparişi yok (son ${LIST_LIMIT} sipariş).`
                    : "Sipariş yok."}
              </Text>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b text-ui-fg-subtle">
                    <th className="w-10 px-6 py-2">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </th>
                    <th className="py-2 txt-compact-small-plus">Sipariş</th>
                    <th className="py-2 txt-compact-small-plus">Tarih</th>
                    <th className="py-2 txt-compact-small-plus">Alıcı</th>
                    <th className="py-2 txt-compact-small-plus">Durum</th>
                    <th className="py-2 pr-6 txt-compact-small-plus">Kargo durumu</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ order, timeline }) => {
                    const ship = shippingStatus(order)
                    return (
                    <tr key={order.id} className="border-b last:border-b-0">
                      <td className="px-6 py-2">
                        <Checkbox
                          checked={selected.has(order.id)}
                          disabled={awaitingBankTransfer(order) || timeline.canceled}
                          onCheckedChange={() => toggle(order.id)}
                        />
                      </td>
                      <td className="py-2 txt-compact-small">
                        <Link to={`/orders/${order.id}`} className="text-ui-fg-interactive">
                          #{order.display_id ?? order.id}
                        </Link>
                      </td>
                      <td className="py-2 txt-compact-small">{formatDate(order.created_at)}</td>
                      <td className="py-2 txt-compact-small">
                        {[order.shipping_address?.first_name, order.shipping_address?.last_name]
                          .filter(Boolean)
                          .join(" ") || order.email || "—"}
                        {order.shipping_address?.city ? (
                          <span className="text-ui-fg-subtle"> · {order.shipping_address.city}</span>
                        ) : null}
                      </td>
                      <td className="py-2">
                        {timeline.canceled ? (
                          <Badge size="2xsmall" color="red">
                            İptal edildi
                          </Badge>
                        ) : awaitingBankTransfer(order) ? (
                          <Badge size="2xsmall" color="red">
                            Havale bekliyor
                          </Badge>
                        ) : (
                          <Badge size="2xsmall" color={timeline.currentKey === "prepared" ? "blue" : "orange"}>
                            {ORDER_STATUS_BADGE[timeline.currentKey]}
                          </Badge>
                        )}
                        {labelPrintedAt(order) ? (
                          <div className="mt-0.5">
                            <Badge size="2xsmall" color="green">
                              Etiket yazdırıldı
                            </Badge>
                            <div className="txt-compact-xsmall text-ui-fg-subtle mt-0.5">
                              {formatDate(labelPrintedAt(order))}
                            </div>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-6">
                        <Badge size="2xsmall" color={ship.color}>
                          {ship.label}
                        </Badge>
                        {ship.detail ? (
                          <div className="txt-compact-xsmall text-ui-fg-subtle mt-0.5 font-mono">
                            {ship.detail}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  // Medusa 2.18: .before/.after yok sayılır, sıra "Sayfayı düzenle" tercihinden gelir.
  // Sabit id → kaydedilen düzen dosya adı değişse de korunur.
  id: "escay-bulk-labels",
  zone: "order.list.before",
})

export default OrderBulkLabelsWidget
