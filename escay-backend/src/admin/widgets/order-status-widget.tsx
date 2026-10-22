import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
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

  if (!orderId) return null
  if (isLoading) {
    return (
      <Container className="p-4">
        <Text size="small" className="text-ui-fg-subtle">Sipariş durumu yükleniyor…</Text>
      </Container>
    )
  }
  if (!timeline) return null

  if (timeline.canceled) {
    return (
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Sipariş durumu</Heading>
          <Badge color="grey">İptal</Badge>
        </div>
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">İptal edilmiş sipariş ilerletilemez.</Text>
        </div>
      </Container>
    )
  }

  const currentLabel = timeline.steps.find((s) => s.current)?.label || "—"

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Sipariş durumu</Heading>
        <Badge color="blue">{currentLabel}</Badge>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {timeline.steps.map((step) => (
            <li key={step.key} className="flex items-center gap-2 text-ui-fg-subtle">
              <span
                className={`inline-block h-2 w-2 rounded-full ${step.done || step.current ? "bg-ui-fg-interactive" : "bg-ui-border-base"}`}
              />
              <Text size="small" className={step.current ? "text-ui-fg-base font-medium" : undefined}>
                {step.label}
              </Text>
            </li>
          ))}
        </ol>
      </div>

      {carrierLinked && nextAction !== null ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {carrierName || "Kargo firması"} gönderisi bağlı ({shipmentRef}) — kargo durumu ve müşteri
            mailleri firma bildirimiyle otomatik güncellenir. Aşağıdaki butonlar elle düzeltme içindir.
          </Text>
        </div>
      ) : null}

      {nextAction ? (
        <div className="flex flex-col gap-3 px-6 py-4">
          {(nextAction === "ship" || nextAction === "deliver") && (
            <div className="flex flex-col gap-2">
              <div>
                <Label htmlFor="escay-track-no">Takip no (opsiyonel)</Label>
                <Input
                  id="escay-track-no"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Örn. 1234567890"
                />
              </div>
              <div>
                <Label htmlFor="escay-track-url">Takip linki (opsiyonel)</Label>
                <Input
                  id="escay-track-url"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          )}
          <Button variant="primary" isLoading={advanceMut.isPending} onClick={() => advanceMut.mutate(nextAction)}>
            {ACTION_LABEL[nextAction]}
          </Button>
          {nextAction !== "deliver" ? (
            <div className="flex flex-wrap gap-2">
              {nextAction === "prepare" ? (
                <>
                  <Button variant="secondary" size="small" disabled={advanceMut.isPending} onClick={() => advanceMut.mutate("ship")}>
                    Doğrudan kargoya ver
                  </Button>
                  <Button variant="secondary" size="small" disabled={advanceMut.isPending} onClick={() => advanceMut.mutate("deliver")}>
                    Doğrudan teslim
                  </Button>
                </>
              ) : null}
              {nextAction === "ship" ? (
                <Button variant="secondary" size="small" disabled={advanceMut.isPending} onClick={() => advanceMut.mutate("deliver")}>
                  Doğrudan teslim
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">Sipariş teslim edildi — başka adım yok.</Text>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default OrderStatusWidget
