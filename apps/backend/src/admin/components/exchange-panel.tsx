import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { exchangeDisplayState, readExchange, type ExchangeMeta } from "../../lib/exchange-plan"
import { ExchangeForm, EXCHANGE_STATE_BADGE, postJson, type ExchangeFormLine } from "./exchange-form"
import { printExchangeLabels, skippedLabelsMessage } from "../lib/print-labels"

type ReturnRow = {
  id: string
  status?: string | null
  created_at?: string | null
  items?: { item_id?: string | null; quantity?: number | null }[] | null
  metadata?: Record<string, unknown> | null
}

type Fulfillment = {
  id: string
  canceled_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  data?: Record<string, unknown> | null
}

type OptionsItem = {
  item_id: string
  title: string
  variant: string | null
  choices: { variant_id: string; title: string; sku: string | null; available: number | null }[]
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""

/**
 * Değişim kutusu. İki kullanım:
 * - returnId: iade sayfası — o iadenin değişimi (durum, yeni ürün gönderisi,
 *   etiket) ya da "Bu iadeyi değişime çevir".
 * - newOnly: sipariş sayfası — yalnız "Değişim aç" (teslim edilmiş ürün için
 *   yeni gramaj/çeşit); açılan değişim iade sayfasından yürür.
 */
export const ExchangePanel = ({
  orderId,
  returnId,
  newOnly = false,
  onCreated,
}: {
  orderId: string
  returnId?: string
  newOnly?: boolean
  /** Yeni değişim açılınca, açılan iadenin kimliğiyle */
  onCreated?: (returnId: string) => void
}) => {
  const qc = useQueryClient()
  const [mode, setMode] = useState<null | "new" | `convert:${string}`>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["escay-order-exchange", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=id,*returns,*returns.metadata,*returns.items,fulfillments.id,fulfillments.canceled_at,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.data,items.id,items.title,items.variant_title,items.detail.delivered_quantity,items.detail.return_requested_quantity,items.detail.return_received_quantity,items.detail.return_dismissed_quantity`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{
        order?: {
          returns?: ReturnRow[]
          fulfillments?: Fulfillment[]
          items?: { id: string; title?: string; variant_title?: string | null; detail?: Record<string, unknown> }[]
        }
      }>
    },
  })
  const options = useQuery({
    queryKey: ["escay-order-exchange-options", orderId],
    enabled: Boolean(orderId) && mode !== null,
    queryFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}/exchange`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as { items: OptionsItem[] }
    },
  })

  const refresh = () => {
    void qc.invalidateQueries()
    for (const ms of [3000, 8000]) window.setTimeout(() => void qc.invalidateQueries(), ms)
  }
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast.success(ok)
      setMode(null)
      refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const createMut = useMutation({
    mutationFn: (input: { items: { item_id: string; quantity: number; variant_id: string }[]; note: string }) =>
      postJson(`/admin/orders/${orderId}/exchange`, input) as Promise<{ return?: { id?: string } }>,
  })

  if (!orderId || isLoading) return null
  const order = data?.order
  // Sipariş sayfasında (newOnly) liste yok; iade sayfasında yalnız o iade.
  const returns = newOnly ? [] : (order?.returns || []).filter((r) => !returnId || r.id === returnId)
  const fulfillments = order?.fulfillments || []
  const num = (v: unknown) => (v && typeof v === "object" && "value" in (v as object) ? Number((v as { value: unknown }).value) : Number(v || 0))
  const returnable = new Map(
    (order?.items || []).map((i) => {
      const d = i.detail || {}
      return [
        i.id,
        Math.max(0, num(d.delivered_quantity) - num(d.return_requested_quantity) - num(d.return_received_quantity) - num(d.return_dismissed_quantity)),
      ]
    })
  )
  const exchanges = returns.map((r) => ({ r, ex: readExchange(r.metadata) })).filter((x) => x.ex) as { r: ReturnRow; ex: ExchangeMeta }[]
  const isRejected = (r: ReturnRow) => (r.metadata?.escay_rejection as { rejected?: boolean } | undefined)?.rejected === true
  const convertible = returns.filter(
    (r) =>
      !readExchange(r.metadata) &&
      !isRejected(r) &&
      r.status !== "canceled" &&
      (r.metadata?.paytr_refund as { status?: string } | undefined)?.status !== "success"
  )
  const canOpen = newOnly && [...returnable.values()].some((n) => n > 0)
  if (!exchanges.length && !convertible.length && !canOpen) return null

  const formLines = (filter?: (itemId: string) => number | null): ExchangeFormLine[] =>
    (options.data?.items || [])
      .map((o) => {
        const max = filter ? filter(o.item_id) : returnable.get(o.item_id) || 0
        return max === null
          ? null
          : { key: o.item_id, title: o.title, variant: o.variant, max, choices: o.choices }
      })
      .filter(Boolean) as ExchangeFormLine[]

  if (newOnly) {
    return mode === "new" ? (
      <div className="flex flex-col gap-2 rounded-md bg-ui-bg-subtle p-3">
        <Text size="small" className="text-ui-fg-subtle">
          Para iadesi yok: eski ürün geri gelince yeni ürünün gönderisi otomatik açılır.
        </Text>
        {options.isLoading ? (
          <Text size="small" className="text-ui-fg-subtle">Seçenekler yükleniyor…</Text>
        ) : (
          <ExchangeForm
            lines={formLines()}
            submitLabel="Değişim talebi aç"
            withNote
            busy={createMut.isPending}
            onCancel={() => setMode(null)}
            onSubmit={(sel, note) =>
              run(
                "new",
                async () => {
                  const json = await createMut.mutateAsync({
                    items: sel.map((s) => ({ item_id: s.key, quantity: s.quantity, variant_id: s.variant_id })),
                    note,
                  })
                  if (json?.return?.id) onCreated?.(json.return.id)
                },
                "Değişim açıldı — iade kodunu değişim sayfasından gönderin"
              )
            }
          />
        )}
      </div>
    ) : (
      <div>
        <Button size="small" variant="secondary" onClick={() => setMode("new")}>
          Değişim aç
        </Button>
      </div>
    )
  }

  return (
    <Container className="px-6 py-4">
      <Heading level="h2" className="mb-3">Değişim</Heading>
      <div className="flex flex-col gap-3">
        {exchanges.map(({ r, ex }) => {
          const f = ex.fulfillment_id ? fulfillments.find((x) => x.id === ex.fulfillment_id) : undefined
          const state = exchangeDisplayState({
            exchange: ex,
            returnReceived: r.status === "received" || r.status === "partially_received",
            returnRejected: isRejected(r),
            returnCanceled: r.status === "canceled",
            shipment: f ? { shipped: Boolean(f.shipped_at), delivered: Boolean(f.delivered_at), canceled: Boolean(f.canceled_at) } : null,
          })
          const badge = EXCHANGE_STATE_BADGE[state]
          const tracking = (f?.data?.tracking_number as string) || ""
          return (
            <div key={r.id} className="rounded-md border border-ui-border-base p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={badge.color}>{badge.label}</Badge>
                <Text size="small" className="text-ui-fg-subtle">{fmt(ex.requested_at)}</Text>
                {ex.label_printed_at ? (
                  <Badge size="2xsmall" color="green">Etiket yazdırıldı · {fmt(ex.label_printed_at)}</Badge>
                ) : null}
              </div>
              {ex.items.map((it, i) => (
                <Text key={i} size="small">
                  {it.quantity} × {it.title}
                  {it.from_variant ? ` ${it.from_variant}` : ""} → <strong>{it.to_variant || "?"}</strong>
                  {it.to_sku ? <span className="text-ui-fg-subtle"> · {it.to_sku}</span> : null}
                </Text>
              ))}
              {tracking ? <Text size="small" className="text-ui-fg-subtle">Yeni ürün takip no: {tracking}</Text> : null}
              {state === "failed" ? <Text size="small" className="text-ui-fg-error">{ex.error}</Text> : null}
              <div className="flex flex-wrap gap-2">
                {state === "to_ship" || state === "failed" ? (
                  <Button
                    size="small"
                    variant="primary"
                    isLoading={busy === `ship:${r.id}`}
                    disabled={busy !== null}
                    onClick={() => run(`ship:${r.id}`, () => postJson(`/admin/returns/${r.id}/exchange/ship`), "Yeni ürünün gönderisi açıldı")}
                  >
                    Yeni ürünü gönder
                  </Button>
                ) : null}
                {state === "label_ready" ? (
                  <>
                    <Button
                      size="small"
                      variant="primary"
                      isLoading={busy === `label:${r.id}`}
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `label:${r.id}`,
                          async () => {
                            const skipped = await printExchangeLabels([r.id], true)
                            if (skipped.length) toast.warning(skippedLabelsMessage(skipped))
                          },
                          "Etiket açıldı"
                        )
                      }
                    >
                      Etiket + fiş
                    </Button>
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm("Mevcut gönderi iptal edilip yenisi açılacak (eski etiket geçersiz). Devam?"))
                          void run(`reship:${r.id}`, () => postJson(`/admin/returns/${r.id}/exchange/reship`), "Gönderi yeniden açıldı")
                      }}
                    >
                      Yeniden aç
                    </Button>
                  </>
                ) : null}
                {state === "awaiting_return" || state === "to_ship" || state === "failed" ? (
                  <Button
                    size="small"
                    variant="danger"
                    disabled={busy !== null}
                    onClick={() => {
                      const received = state !== "awaiting_return"
                      const ok = window.confirm(
                        received
                          ? "Değişim iptal edilecek. Ürün teslim alındığı için parası iade edilsin mi? (Tamam = para iadesi yap, İptal = vazgeç)"
                          : "Değişim iptal edilecek; iade normal iade olarak sürer (ürün gelince para iadesi). Devam?"
                      )
                      if (ok) void run(`cancel:${r.id}`, () => postJson(`/admin/returns/${r.id}/exchange/cancel`, { refund: received }), "Değişim iptal edildi")
                    }}
                  >
                    Değişimi iptal et
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}

        {convertible.map((r) => (
          <div key={r.id} className="space-y-2">
            <Text size="small" className="text-ui-fg-subtle">
              Müşteri parasını değil başka gramaj/çeşit istiyorsa: para iadesi yapılmaz, ürün geri gelince yeni ürün gönderilir.
            </Text>
            {mode === `convert:${r.id}` ? (
              options.isLoading ? (
                <Text size="small" className="text-ui-fg-subtle">Seçenekler yükleniyor…</Text>
              ) : (
                <ExchangeForm
                  lines={formLines((itemId) => {
                    const it = (r.items || []).find((x) => x.item_id === itemId)
                    return it ? Number(it.quantity || 0) : null
                  })}
                  submitLabel="Değişime çevir"
                  busy={busy === `convert:${r.id}`}
                  onCancel={() => setMode(null)}
                  onSubmit={(sel) =>
                    run(
                      `convert:${r.id}`,
                      () =>
                        postJson(`/admin/returns/${r.id}/exchange`, {
                          items: sel.map((s) => ({ item_id: s.key, quantity: s.quantity, variant_id: s.variant_id })),
                        }),
                      "İade değişime çevrildi — para iadesi yapılmayacak"
                    )
                  }
                />
              )
            ) : (
              <Button size="small" variant="secondary" disabled={mode !== null} onClick={() => setMode(`convert:${r.id}`)}>
                Bu iadeyi değişime çevir
              </Button>
            )}
          </div>
        ))}
      </div>
    </Container>
  )
}
