import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useParams } from "react-router-dom"
import { fetchOpsEvents, formatEventDate, OPS_KIND_LABEL, OPS_LEVEL_BADGE } from "../lib/ops-events"

type FulfillmentState = {
  paid: boolean
  canceled: boolean
  has_fulfillment: boolean
  carrier_configured: boolean
  carrier: { code: string; name: string } | null
  active: { id: string; shipped: boolean; delivered: boolean; data: Record<string, unknown> } | null
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
  return json
}

/**
 * Sipariş detayı — Kargo kurtarma + bu siparişin olayları.
 *
 * Ödenmiş ama kargo kaydı olmayan siparişte (firma adaptörü bağlıyken):
 * "Gönderi aç" yeni gönderi/etiket oluşturur. Kurye almadan sorun çıktıysa
 * "Yeniden aç" firmadaki gönderiyi iptal edip yenisini açar (reddederse durur).
 */
const OrderOpsWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const prompt = usePrompt()

  const state = useQuery({
    queryKey: ["order-fulfillment-state", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}/fulfillment`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<FulfillmentState>
    },
  })

  const events = useQuery({
    queryKey: ["order-ops-events", orderId],
    enabled: Boolean(orderId),
    queryFn: () => fetchOpsEvents({ order_id: orderId, limit: 20 }),
  })

  const refresh = () => void qc.invalidateQueries()

  const retry = useMutation({
    mutationFn: () => postJson(`/admin/orders/${orderId}/fulfillment/retry`),
    onSuccess: () => {
      toast.success("Kargo gönderisi açıldı.")
      refresh()
    },
    onError: (e: Error) => {
      toast.error(e.message)
      refresh()
    },
  })

  const reship = useMutation({
    mutationFn: () => postJson(`/admin/orders/${orderId}/fulfillment/reship`),
    onSuccess: () => {
      toast.success("Gönderi yeniden açıldı. Etiketi yeniden yazdırın.")
      refresh()
    },
    onError: (e: Error) => toast.error(e.message, { duration: 60000 }),
  })

  const [attachOpen, setAttachOpen] = useState(false)
  const [attachRef, setAttachRef] = useState("")
  const [attachTracking, setAttachTracking] = useState("")
  const [attachShipped, setAttachShipped] = useState(true)
  const attach = useMutation({
    mutationFn: () =>
      postJson(`/admin/orders/${orderId}/fulfillment/attach`, {
        shipment_ref: attachRef.trim() || undefined,
        tracking_number: attachTracking.trim() || undefined,
        mark_shipped: attachShipped,
      }),
    onSuccess: () => {
      toast.success("Dış gönderi siparişe bağlandı.")
      setAttachOpen(false)
      setAttachRef("")
      setAttachTracking("")
      refresh()
    },
    onError: (e: Error) => toast.error(e.message, { duration: 60000 }),
  })

  if (!orderId) return null

  const g = state.data
  const needsShipment = Boolean(g && g.carrier_configured && g.paid && !g.canceled && !g.has_fulfillment)
  const canReship = Boolean(g && g.carrier_configured && g.active && !g.active.shipped && !g.active.delivered && !g.canceled)
  // Şubede elle açılmış gönderi: kayıt yok ya da kayıtta firma kimliği yok ve paket henüz "kargoya verildi" değil.
  const canAttach = Boolean(g && g.paid && !g.canceled && (!g.active || (!g.active.shipped && !g.active.data.shipment_ref)))
  const list = events.data?.events || []

  if (!needsShipment && !canReship && !canAttach && list.length === 0) return null

  const onRetry = async () => {
    const ok = await prompt({
      title: `Yeni ${g?.carrier?.name || "kargo"} gönderisi açılsın mı?`,
      description: "Yeni gönderi açılır ve etiket oluşturulur (kargo ücreti). Firmada bu siparişe ait açık gönderi olmadığından emin olun.",
      confirmText: "Gönderi aç",
      cancelText: "Vazgeç",
    })
    if (ok) retry.mutate()
  }

  const onReship = async () => {
    const ok = await prompt({
      title: "Gönderi yeniden açılsın mı?",
      description: "Mevcut gönderi firmada iptal edilir (reddederse işlem durur), kayıt iptal edilir ve yeni gönderi açılır. Eski etiket geçersiz olur. Kuryenin almadığı paketler için yapın.",
      confirmText: "Yeniden aç",
      cancelText: "Vazgeç",
    })
    if (ok) reship.mutate()
  }

  return (
    <Container className="divide-y p-0">
      {needsShipment ? (
        <div className="flex flex-col gap-2 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <Heading level="h2">Kargo ({g?.carrier?.name})</Heading>
            <Badge color="red" size="2xsmall">Gönderi yok</Badge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            Ödeme alınmış ama kargo kaydı yok. Logs'taki hatayı giderip gönderiyi açın.
          </Text>
          <div>
            <Button size="small" variant="secondary" isLoading={retry.isPending} onClick={() => void onRetry()}>
              Gönderi aç
            </Button>
          </div>
        </div>
      ) : null}

      {canReship ? (
        <div className="flex flex-col gap-2 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <Heading level="h2">Kargo ({g?.carrier?.name})</Heading>
            <Badge color="blue" size="2xsmall">{String(g?.active?.data.status || "Gönderi açık")}</Badge>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle font-mono">
            {g?.active?.data.shipment_ref ? `Ref ${String(g.active.data.shipment_ref)}` : ""}
            {g?.active?.data.tracking_number ? ` · Takip ${String(g.active.data.tracking_number)}` : ""}
          </Text>
          <div>
            <Button size="small" variant="secondary" isLoading={reship.isPending} onClick={() => void onReship()}>
              Gönderiyi yeniden aç
            </Button>
          </div>
        </div>
      ) : null}

      {canAttach ? (
        <div className="flex flex-col gap-2 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <Heading level="h2">Dış gönderi</Heading>
            <Button size="small" variant="transparent" onClick={() => setAttachOpen((v) => !v)}>
              {attachOpen ? "Kapat" : "Siparişe bağla"}
            </Button>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            Paket şubede ya da firma panelinde elle açıldıysa kimliğini buraya yazın; firmaya yeni gönderi açılmaz, takip ve teslim buradan izlenir.
          </Text>
          {attachOpen ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label size="xsmall">Firma gönderi kimliği (ref)</Label>
                <Input size="small" value={attachRef} onChange={(e) => setAttachRef(e.target.value)} placeholder="Firma panelindeki gönderi no" />
              </div>
              <div className="flex flex-col gap-1">
                <Label size="xsmall">Takip numarası</Label>
                <Input size="small" value={attachTracking} onChange={(e) => setAttachTracking(e.target.value)} placeholder="Takip / barkod" />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="attach-shipped" checked={attachShipped} onCheckedChange={(v) => setAttachShipped(v === true)} />
                <Label htmlFor="attach-shipped" size="xsmall">Paket kargoya verildi (müşteriye kargo maili gider)</Label>
              </div>
              <div>
                <Button
                  size="small"
                  variant="secondary"
                  isLoading={attach.isPending}
                  disabled={!attachRef.trim() && !attachTracking.trim()}
                  onClick={() => attach.mutate()}
                >
                  Bağla
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {list.length ? (
        <div className="flex flex-col gap-2 px-6 py-4">
          <Heading level="h2">Olaylar</Heading>
          {list.map((e) => {
            const badge = OPS_LEVEL_BADGE[e.level] || OPS_LEVEL_BADGE.info
            return (
              <div key={e.id} className="flex flex-col gap-0.5 border-b border-ui-border-base pb-2 last:border-b-0">
                <div className="flex items-center gap-2">
                  <Badge size="2xsmall" color={badge.color}>{OPS_KIND_LABEL[e.kind] || e.kind}</Badge>
                  <Text size="xsmall" className="text-ui-fg-subtle">{formatEventDate(e.created_at)}</Text>
                </div>
                <Text size="small">{e.title}</Text>
                {e.detail ? (
                  <Text size="xsmall" className="text-ui-fg-subtle whitespace-pre-wrap">{e.detail}</Text>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  // Düzen kimliği: scripts/setup-admin-layouts.ts sıralamayı bununla yapar.
  id: "escay-order-events",
  zone: "order.details.side.before",
})

export default OrderOpsWidget
