import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"
import { printOrderLabels, skippedLabelsMessage } from "../lib/print-labels"

type OrderPayload = {
  order?: {
    id: string
    metadata?: Record<string, unknown> | null
    fulfillments?: {
      canceled_at?: string | null
      delivered_at?: string | null
      data?: Record<string, unknown> | null
    }[] | null
  }
}

function hasCarrierLabel(data: Record<string, unknown> | null | undefined): boolean {
  const d = data || {}
  return (typeof d.label_url === "string" && d.label_url.length > 0) || (typeof d.label_zpl === "string" && d.label_zpl.length > 0)
}

/**
 * Sipariş detayı — etiket PDF'i: kargo firmasının resmi etiketi olduğu gibi (kurye
 * bunu okutur); "Etiket + fiş" arkasına sipariş fişi sayfası ekler. Firma adaptörü
 * yoksa hazırlık fişi basılır (firmanın etiketi kendi panelinden).
 */
const OrderLabelWidget = () => {
  const { id: orderId } = useParams()
  const [busy, setBusy] = useState<"label" | "slip" | null>(null)
  // Ödeme sonrası firma etiketi dakikalar içinde gelebilir — sayfa yenilemeden
  // etiket butonları açılsın diye etiket gelene kadar yoklanır (en çok 10 dk).
  const [mountedAt] = useState(() => Date.now())

  const { data, refetch } = useQuery({
    queryKey: ["order-label", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=id,metadata,fulfillments.canceled_at,fulfillments.delivered_at,fulfillments.data`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<OrderPayload>
    },
    refetchInterval: (query) => {
      const fulfillments = (query.state.data as OrderPayload | undefined)?.order?.fulfillments || []
      const hasLabel = fulfillments.some((f) => !f.canceled_at && hasCarrierLabel(f.data))
      const waiting = fulfillments.some((f) => !f.canceled_at && typeof f.data?.shipment_ref === "string" && !hasCarrierLabel(f.data))
      return hasLabel || !waiting || Date.now() - mountedAt > 10 * 60 * 1000 ? false : 10_000
    },
  })

  if (!orderId) return null
  // Teslim edilmiş siparişte giden kargo etiketi yazdırılmaz (iade ekranıyla karışmasın).
  if ((data?.order?.fulfillments || []).some((f) => !f.canceled_at && f.delivered_at)) return null

  const order = data?.order
  const note =
    typeof order?.metadata?.order_note === "string" ? order.metadata.order_note.trim() : ""
  const active = (order?.fulfillments || []).find((f) => !f.canceled_at)
  const hasBarcode = hasCarrierLabel(active?.data)
  const waitingLabel = Boolean(active && typeof active.data?.shipment_ref === "string" && !hasBarcode)
  const printedAt =
    typeof order?.metadata?.label_printed_at === "string" ? order.metadata.label_printed_at : ""

  const print = async (withSlip: boolean) => {
    setBusy(withSlip ? "slip" : "label")
    try {
      const skipped = await printOrderLabels([orderId], withSlip)
      if (skipped.length) toast.warning(skippedLabelsMessage(skipped))
      refetch()
    } catch (err) {
      toast.error((err as Error).message || "Etiket alınamadı")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Etiket</Heading>
        {printedAt ? (
          <Badge size="2xsmall" color="green">
            Etiket yazdırıldı ·{" "}
            {new Date(printedAt).toLocaleString("tr-TR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Badge>
        ) : (
          <Badge size="2xsmall" color="grey">
            Etiket yazdırılmadı
          </Badge>
        )}
      </div>
      {note ? (
        <div className="flex flex-col gap-1 px-6 py-4">
          <Text size="small" weight="plus">
            Sipariş notu
          </Text>
          <Text size="small" className="whitespace-pre-wrap">
            {note}
          </Text>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 px-6 py-4">
        <Text size="small" className="text-ui-fg-subtle">
          {hasBarcode
            ? "Kargo firmasının etiketi geldiği gibi (kurye bunu okutur)."
            : waitingLabel
              ? "Kargo etiketi bekleniyor… (gönderi açıldı, etiket birkaç dakika içinde gelir; sayfa kendini yeniler)"
              : "Firma etiketi yok — hazırlık/sipariş fişi basılır; kargo etiketini firmanın panelinden alın."}
        </Text>
        <div className="flex flex-wrap gap-2">
          {hasBarcode ? (
            <>
              <Button
                size="small"
                variant="primary"
                isLoading={busy === "slip"}
                disabled={busy !== null}
                onClick={() => print(true)}
              >
                Etiket + fiş
              </Button>
              <Button
                size="small"
                variant="secondary"
                isLoading={busy === "label"}
                disabled={busy !== null}
                onClick={() => print(false)}
              >
                Fişsiz
              </Button>
            </>
          ) : (
            <Button
              size="small"
              variant="primary"
              isLoading={busy === "label"}
              disabled={busy !== null}
              onClick={() => print(false)}
            >
              Etiketi yazdır
            </Button>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderLabelWidget
