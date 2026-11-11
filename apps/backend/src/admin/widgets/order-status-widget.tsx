import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"
import { nextOrderStatusAction, resolveOrderTimeline, type OrderTimelineInput } from "../lib/order-timeline"

type OrderPayload = { order?: OrderTimelineInput & { id?: string } }

type StatusAction = "prepare" | "ship" | "deliver"

const ACTION_LABEL: Record<StatusAction, string> = {
  prepare: "Hazırlandı işaretle",
  ship: "Kargoya ver",
  deliver: "Teslim edildi",
}

/**
 * Sipariş detayı — müşteri timeline adımlarını Medusa fulfill/ship/deliver ile yönet.
 * Kargo firması adaptörü bağlıysa durum webhook/yoklama ile de ilerler; burası elle yoldur.
 */
const OrderStatusWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const [trackingNumber, setTrackingNumber] = useState("")
  const [trackingUrl, setTrackingUrl] = useState("")
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["order-status", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=id,status,metadata,*payment_collections,*fulfillments,*fulfillments.labels,*fulfillments.data`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<OrderPayload>
    },
  })

  const order = data?.order
  const timeline = order ? resolveOrderTimeline(order) : null
  const nextAction = order ? nextOrderStatusAction(order) : null
  const activeFulfillment = (order?.fulfillments || []).find((f) => !f.canceled_at)
  const fData = (activeFulfillment?.data || {}) as Record<string, unknown>
  const carrierName = typeof fData.carrier_name === "string" ? fData.carrier_name : null
  const shipmentRef = typeof fData.shipment_ref === "string" ? fData.shipment_ref : null
  const carrierLinked = Boolean(shipmentRef && fData.carrier !== "manual")

  const advanceMut = useMutation({
    mutationFn: async (action: StatusAction) => {
      const res = await fetch(`/admin/orders/${orderId}/escay-status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          tracking_number: trackingNumber.trim() || null,
          tracking_url: trackingUrl.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
      return json
    },
    onSuccess: () => {
      toast.success("Sipariş durumu güncellendi")
      setTrackingNumber("")
      setTrackingUrl("")
      qc.invalidateQueries({ queryKey: ["order-status", orderId] })
    },
    onError: (err: Error) => toast.error(err.message || "Güncelleme başarısız"),
  })

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}/escay-cancel`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
      return json as { refund_amount?: number; manual_refund?: boolean }
    },
    onSuccess: (json) => {
      const amount = Number(json.refund_amount || 0)
      toast.success(
        amount <= 0
          ? "Sipariş iptal edildi"
          : json.manual_refund
            ? `Sipariş iptal edildi. ${amount.toFixed(2)} TL'yi müşteriye elle iade edin.`
            : `Sipariş iptal edildi, ${amount.toFixed(2)} TL karta iade edildi.`
      )
      setCancelOpen(false)
      setCancelReason("")
      void qc.invalidateQueries()
    },
    onError: (err: Error) => {
      toast.error(err.message || "İptal edilemedi", { duration: 60000 })
      void qc.invalidateQueries()
    },
  })

  if (!orderId) return null
  if (isLoading) {
    return (
      <Container className="px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">Sipariş durumu yükleniyor…</Text>
      </Container>
    )
  }
  if (!timeline) return null

  // Teslim edilmiş / iptal siparişte iş kalmadı; durum başlıktaki rozette yazar.
  if (timeline.canceled || !nextAction) return null
  // Kargoya verilmemiş sipariş iptal edilebilir (kargoya verildiyse sıradaki iş "deliver").
  const canCancel = nextAction !== "deliver" && !(order?.fulfillments || []).some((f) => !f.canceled_at && (f.shipped_at || f.delivered_at))

  return (
    <Container className="flex flex-col gap-4 px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <Heading level="h2">Sipariş durumu</Heading>
        {carrierLinked ? (
          <Text size="xsmall" className="text-ui-fg-subtle">
            {carrierName || "Kargo"} bağlı · durum otomatik ilerler
          </Text>
        ) : null}
      </div>

      <ol className="m-0 grid list-none grid-cols-5 gap-1 p-0">
        {timeline.steps.map((step) => (
          <li key={step.key} className="flex flex-col gap-1.5">
            <span
              className={`block h-1 rounded-full ${step.done || step.current ? "bg-ui-fg-interactive" : "bg-ui-border-strong"}`}
            />
            <Text
              size="xsmall"
              className={step.current ? "text-ui-fg-base font-medium" : "text-ui-fg-subtle"}
            >
              {step.label.replace(/^Siparişin /, "")}
            </Text>
          </li>
        ))}
      </ol>

      {nextAction === "ship" || nextAction === "deliver" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            aria-label="Takip no"
            size="small"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Takip no (opsiyonel)"
          />
          <Input
            aria-label="Takip linki"
            size="small"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="Takip linki (opsiyonel)"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="small" variant="primary" isLoading={advanceMut.isPending} onClick={() => advanceMut.mutate(nextAction)}>
          {ACTION_LABEL[nextAction]}
        </Button>
        {nextAction === "prepare" ? (
          <Button size="small" variant="transparent" disabled={advanceMut.isPending} onClick={() => advanceMut.mutate("ship")}>
            Doğrudan kargoya ver
          </Button>
        ) : null}
        {nextAction !== "deliver" ? (
          <Button size="small" variant="transparent" disabled={advanceMut.isPending} onClick={() => advanceMut.mutate("deliver")}>
            Doğrudan teslim
          </Button>
        ) : null}
        {canCancel && !cancelOpen ? (
          <Button
            size="small"
            variant="transparent"
            className="ml-auto text-ui-fg-error"
            disabled={advanceMut.isPending}
            onClick={() => setCancelOpen(true)}
          >
            Siparişi iptal et
          </Button>
        ) : null}
      </div>

      {canCancel && cancelOpen ? (
        <div className="flex flex-col gap-2 rounded-md bg-ui-bg-subtle p-3">
          <Text size="small">
            {carrierLinked ? "Kargo gönderisi firmada iptal edilir, " : ""}
            sipariş iptal edilir ve ödenen tutar müşterinin kartına iade edilir. Müşteriye iptal maili gider. Geri alınamaz.
          </Text>
          <Input
            size="small"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Sebep (müşteriye mailde görünür, opsiyonel)"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="small" variant="danger" isLoading={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
              İptal et ve parayı iade et
            </Button>
            <Button size="small" variant="secondary" disabled={cancelMut.isPending} onClick={() => setCancelOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  // Düzen kimliği: scripts/setup-admin-layouts.ts sıralamayı bununla yapar.
  id: "escay-order-status",
  zone: "order.details.after",
})

export default OrderStatusWidget
