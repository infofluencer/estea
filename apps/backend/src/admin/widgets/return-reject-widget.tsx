import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

type ReturnRow = {
  id: string
  status?: string | null
  created_at?: string | null
  items?: { item_id?: string | null; quantity?: number | null }[] | null
  metadata?: {
    customer_note?: string | null
    return_code?: string | null
    return_code_sent_at?: string | null
    return_code_source?: "manual" | "carrier" | null
    rejected?: boolean
    escay_acceptance?: {
      reason?: string | null
      items?: { item_id: string; requested: number; restock: number; damaged: number; rejected: number }[]
    } | null
    escay_rejection?: { rejected?: boolean; reason?: string | null }
    escay_exchange?: { status?: string } | null
    paytr_refund?: {
      status?: string
      amount?: number
      error?: string
      manual_required?: boolean
    }
  } | null
}

function isRejected(r: ReturnRow): boolean {
  if (r.metadata?.escay_rejection?.rejected === true) return true
  if (r.metadata?.rejected === true) return true
  return false
}

function statusLabel(r: ReturnRow): { label: string; color: "green" | "orange" | "red" | "grey" } {
  if (isRejected(r)) return { label: "Reddedildi", color: "red" }
  const pr = r.metadata?.paytr_refund?.status
  if (pr === "success") return { label: "Para iade edildi", color: "green" }
  if (pr === "failed") {
    return r.metadata?.paytr_refund?.manual_required
      ? { label: "Elle iade gerekli (havale)", color: "red" }
      : { label: "Para iadesi başarısız", color: "red" }
  }
  if (r.status === "partially_received") return { label: "Kısmen kabul edildi", color: "orange" }
  if (r.status === "received") return { label: "Teslim alındı", color: "green" }
  if (r.status === "canceled") return { label: "İptal", color: "grey" }
  if (r.status === "requested") return { label: "Talep alındı", color: "orange" }
  return { label: r.status || "—", color: "grey" }
}

type AcceptRow = { restock: number; damaged: number }

/** Ürün bazlı teslim alma — kabul edilenler için para iadesi otomatik (kabul edilmeyen kalem iade almaz). */
async function acceptItems(
  returnId: string,
  rows: Record<string, AcceptRow>,
  reason: string,
  refundShipping: boolean
) {
  const res = await fetch(`/admin/returns/${returnId}/accept`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: Object.entries(rows).map(([item_id, r]) => ({
        item_id,
        restock_quantity: r.restock,
        damaged_quantity: r.damaged,
      })),
      reason: reason.trim() || null,
      refund_shipping: refundShipping,
    }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
  return json as { partial?: boolean }
}

/**
 * Sipariş sayfası "İade" kutusu: durum, ürünler, müşteriye giden kod, tek
 * adımda teslim al (+ otomatik para iadesi) veya reddet.
 */
const ReturnRejectWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const [reasonById, setReasonById] = useState<Record<string, string>>({})
  const [codeById, setCodeById] = useState<Record<string, string>>({})
  // returnId → item_id → kabul satırı (varsayılan: talep edilen adedin tamamı stoğa)
  const [acceptById, setAcceptById] = useState<Record<string, Record<string, AcceptRow>>>({})
  const [partialReasonById, setPartialReasonById] = useState<Record<string, string>>({})
  // returnId → "Kargo ücretini de iade et" işaretli mi
  const [shipById, setShipById] = useState<Record<string, boolean>>({})

  const { data, isLoading } = useQuery({
    queryKey: ["escay-order-returns", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=id,shipping_total,*items,*returns,*returns.metadata,*returns.items`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<{
        order?: {
          shipping_total?: number | null
          returns?: ReturnRow[]
          items?: {
            id: string
            title?: string | null
            variant_title?: string | null
            quantity?: number | null
            unit_price?: number | null
            total?: number | null
            refundable_total_per_unit?: number | null
          }[]
        }
      }>
    },
  })

  const returns = data?.order?.returns || []
  const shippingTotal = Number(data?.order?.shipping_total) || 0
  const lineTitle = new Map(
    (data?.order?.items || []).map((i) => [i.id, [i.title, i.variant_title].filter(Boolean).join(" · ")])
  )
  // Tahmini birim iade tutarı (kesin tutar teslim alınınca sunucuda hesaplanır)
  const unitRefund = new Map(
    (data?.order?.items || []).map((i) => [
      i.id,
      Number(i.refundable_total_per_unit) ||
        (i.total != null && i.quantity ? Number(i.total) / Number(i.quantity) : Number(i.unit_price) || 0),
    ])
  )
  const acceptRows = (r: ReturnRow): Record<string, AcceptRow> => {
    const saved = acceptById[r.id] || {}
    const out: Record<string, AcceptRow> = {}
    for (const it of r.items || []) {
      if (!it.item_id) continue
      out[it.item_id] = saved[it.item_id] ?? { restock: Number(it.quantity || 0), damaged: 0 }
    }
    return out
  }
  const setAccept = (r: ReturnRow, itemId: string, patch: Partial<AcceptRow>) =>
    setAcceptById((prev) => {
      const rows = { ...acceptRows(r), ...(prev[r.id] || {}) }
      const max = Number((r.items || []).find((i) => i.item_id === itemId)?.quantity || 0)
      const next = { ...rows[itemId], ...patch }
      // restock + hasarlı talep edileni aşmasın
      next.restock = Math.max(0, Math.min(max, Math.floor(next.restock || 0)))
      next.damaged = Math.max(0, Math.min(max - next.restock, Math.floor(next.damaged || 0)))
      return { ...prev, [r.id]: { ...rows, [itemId]: next } }
    })

  const codeMut = useMutation({
    mutationFn: async (input: { returnId: string; code: string }) => {
      const res = await fetch(`/admin/returns/${input.returnId}/return-code`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input.code }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
      return json as { email?: string }
    },
    onSuccess: (json) => {
      toast.success(`İade kodu ${json.email || "müşteriye"} gönderildi`)
      qc.invalidateQueries({ queryKey: ["escay-order-returns", orderId] })
    },
    onError: (err: Error) => toast.error(err.message),
  })


  const receiveMut = useMutation({
    mutationFn: (input: { ret: ReturnRow; rows: Record<string, AcceptRow>; reason: string; refundShipping: boolean }) =>
      acceptItems(input.ret.id, input.rows, input.reason, input.refundShipping),
    onSuccess: (json) => {
      toast.success(
        json?.partial
          ? "Kısmen kabul edildi — kabul edilenlerin parası iade ediliyor"
          : "Teslim alındı — para iadesi başlatıldı"
      )
      // Para iadesi + fatura arka planda; birkaç saniye sonra durum güncellensin.
      void qc.invalidateQueries()
      for (const ms of [3000, 8000, 15000]) window.setTimeout(() => void qc.invalidateQueries(), ms)
    },
    onError: (err: Error) => toast.error(`Teslim alınamadı: ${err.message}`),
  })

  const retryMut = useMutation({
    mutationFn: async (input: { returnId: string }) => {
      const res = await fetch(`/admin/returns/${input.returnId}/refund`, {
        method: "POST",
        credentials: "include",
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.paytr_refund?.error || json?.message || `HTTP ${res.status}`)
      }
      return json
    },
    onSuccess: () => {
      toast.success("Para iadesi yapıldı")
      qc.invalidateQueries({ queryKey: ["escay-order-returns", orderId] })
    },
    onError: (err: Error) => {
      toast.error(`Para iadesi yine başarısız: ${err.message}`)
      qc.invalidateQueries({ queryKey: ["escay-order-returns", orderId] })
    },
  })

  const rejectMut = useMutation({
    mutationFn: async (input: { returnId: string; reason: string }) => {
      const res = await fetch(`/admin/returns/${input.returnId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: input.reason || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.message || `HTTP ${res.status}`)
      }
      return json
    },
    onSuccess: () => {
      toast.success("İade reddedildi — para iadesi yapılmayacak")
      qc.invalidateQueries({ queryKey: ["escay-order-returns", orderId] })
    },
    onError: (err: Error) => {
      toast.error(err.message || "Reddetme başarısız")
    },
  })

  if (!orderId) return null
  if (isLoading) {
    return (
      <Container className="p-4">
        <Text size="small" className="text-ui-fg-subtle">
          İadeler yükleniyor…
        </Text>
      </Container>
    )
  }
  if (!returns.length) return null

  return (
    <Container className="p-4">
      <Heading level="h2" className="mb-2">
        İade
      </Heading>
      <Text size="small" className="text-ui-fg-subtle mb-3 block">
        Paket gelince ürün ürün kontrol edin: kabul edilenler stoğa eklenir (hasarlıysa eklenmez) ve
        parası müşterinin kartına otomatik iade edilir. Hiçbiri uygun değilse sebebini yazıp tümünü reddedin.
      </Text>
      <div className="flex flex-col gap-3">
        {returns.map((r) => {
          const st = statusLabel(r)
          const rejected = isRejected(r)
          const canReject =
            !rejected &&
            r.metadata?.paytr_refund?.status !== "success" &&
            r.status !== "canceled"

          return (
            <div
              key={r.id}
              className="rounded-md border border-ui-border-base p-3 space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color={st.color}>{st.label}</Badge>
                {r.metadata?.escay_exchange && r.metadata.escay_exchange.status !== "canceled" ? (
                  <Badge color="blue">Değişim — para iadesi yok, teslim alınca yeni ürün gönderilir</Badge>
                ) : null}
                {r.created_at ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {new Date(r.created_at).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                ) : null}
              </div>
              {r.status === "requested" && !rejected ? null : (r.items || []).map((it, i) => {
                const acc = r.metadata?.escay_acceptance?.items?.find((a) => a.item_id === it.item_id)
                return (
                  <Text key={i} size="small">
                    {it.quantity} × {(it.item_id && lineTitle.get(it.item_id)) || "Ürün"}
                    {acc
                      ? ` — ${[
                          acc.restock ? `${acc.restock} stoğa` : null,
                          acc.damaged ? `${acc.damaged} hasarlı` : null,
                          acc.rejected ? `${acc.rejected} kabul edilmedi` : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}`
                      : ""}
                  </Text>
                )
              })}
              {r.metadata?.escay_acceptance?.reason ? (
                <Text size="small" className="text-ui-fg-subtle">
                  Kabul edilmeme sebebi: {r.metadata.escay_acceptance.reason}
                </Text>
              ) : null}
              {r.metadata?.customer_note ? (
                <Text size="small" className="text-ui-fg-subtle">
                  Müşteri notu: {r.metadata.customer_note}
                </Text>
              ) : null}
              {r.metadata?.return_code ? (
                <Text size="small">
                  Müşteriye giden iade kodu:{" "}
                  <span className="font-mono font-medium">{r.metadata.return_code}</span>
                  {r.metadata.return_code_sent_at
                    ? ` · ${new Date(r.metadata.return_code_sent_at).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : ""}
                  {r.metadata.return_code_source === "carrier" ? " · kargo firmasından" : ""}
                </Text>
              ) : r.status === "requested" && !rejected ? (
                <Text size="small" className="text-ui-fg-error">
                  İade kodu henüz gönderilmedi — kargo firmasının panelinden kodlu iade açıp kodu aşağıya girin.
                </Text>
              ) : null}
              {r.status === "requested" && !rejected ? (
                <div className="flex gap-2">
                  <Input
                    size="small"
                    placeholder="İade kodu"
                    value={codeById[r.id] ?? ""}
                    onChange={(e) => setCodeById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!(codeById[r.id] || "").trim() || codeMut.isPending}
                    isLoading={codeMut.isPending && codeMut.variables?.returnId === r.id}
                    onClick={() => {
                      const code = (codeById[r.id] || "").trim()
                      const ok = window.confirm(
                        `"${code}" kodu müşteriye e-postayla gönderilecek (iade kodu ile kargo şubesine teslim). Devam?`
                      )
                      if (ok) codeMut.mutate({ returnId: r.id, code })
                    }}
                  >
                    Kodu müşteriye gönder
                  </Button>
                </div>
              ) : null}
              {r.status === "requested" && !rejected
                ? (() => {
                    const rows = acceptRows(r)
                    const entries = (r.items || []).filter((it) => it.item_id)
                    const rejectedQty = entries.reduce((s, it) => {
                      const row = rows[it.item_id as string]
                      return s + Number(it.quantity || 0) - row.restock - row.damaged
                    }, 0)
                    const accepted = entries.reduce((s, it) => {
                      const row = rows[it.item_id as string]
                      return s + row.restock + row.damaged
                    }, 0)
                    const estimate = entries.reduce((s, it) => {
                      const row = rows[it.item_id as string]
                      return s + (unitRefund.get(it.item_id as string) || 0) * (row.restock + row.damaged)
                    }, 0)
                    return (
                      <div className="flex flex-col gap-2 rounded-md bg-ui-bg-subtle p-2">
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          Paket gelince her ürün için kabul edilen adedi girin. Hasarlı: para iade edilir, stoğa eklenmez.
                          Kalan adet kabul edilmez (para iadesi yok).
                        </Text>
                        {entries.map((it) => {
                          const id = it.item_id as string
                          const row = rows[id]
                          const left = Number(it.quantity || 0) - row.restock - row.damaged
                          return (
                            <div key={id} className="flex flex-col gap-1 border-b border-ui-border-base pb-2 last:border-0">
                              <Text size="small" weight="plus">
                                {it.quantity} × {lineTitle.get(id) || "Ürün"}
                              </Text>
                              <div className="flex flex-wrap items-center gap-2">
                                <Text size="xsmall">Stoğa</Text>
                                <Input
                                  size="small"
                                  type="number"
                                  min={0}
                                  max={Number(it.quantity || 0)}
                                  value={row.restock}
                                  onChange={(e) => setAccept(r, id, { restock: Number(e.target.value) })}
                                  className="w-[60px]"
                                />
                                <Text size="xsmall">Hasarlı</Text>
                                <Input
                                  size="small"
                                  type="number"
                                  min={0}
                                  max={Number(it.quantity || 0)}
                                  value={row.damaged}
                                  onChange={(e) => setAccept(r, id, { damaged: Number(e.target.value) })}
                                  className="w-[60px]"
                                />
                                {left > 0 ? (
                                  <Badge size="2xsmall" color="red">
                                    {left} kabul edilmedi
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                        {rejectedQty > 0 ? (
                          <Input
                            size="small"
                            placeholder="Kabul edilmeme sebebi (müşteriye mailde görünür)"
                            value={partialReasonById[r.id] || ""}
                            onChange={(e) => setPartialReasonById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          />
                        ) : null}
                        {shippingTotal > 0 ? (
                          <div className="flex items-start gap-2">
                            <Checkbox
                              id={`ship-${r.id}`}
                              checked={Boolean(shipById[r.id])}
                              onCheckedChange={(v) => setShipById((prev) => ({ ...prev, [r.id]: v === true }))}
                            />
                            <Label htmlFor={`ship-${r.id}`} size="xsmall" className="text-ui-fg-subtle">
                              Kargo ücretini de iade et ({shippingTotal.toFixed(2)} TL). İşaretlenmezse kargo yalnız
                              sebep satıcıdan kaynaklıysa (ör. kusurlu ürün) eklenir; bir siparişte en fazla bir kez.
                            </Label>
                          </div>
                        ) : null}
                        {accepted > 0 && estimate > 0 ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            Tahmini para iadesi: {(estimate + (shipById[r.id] ? shippingTotal : 0)).toFixed(2)} TL
                            {shipById[r.id] ? " (kargo dahil)" : " (kargo iadesi sebebe göre ayrıca eklenebilir)"}
                          </Text>
                        ) : null}
                        <Button
                          variant="primary"
                          size="small"
                          isLoading={receiveMut.isPending && receiveMut.variables?.ret.id === r.id}
                          disabled={receiveMut.isPending || accepted === 0}
                          onClick={() => {
                            const summary = entries
                              .map((it) => {
                                const row = rows[it.item_id as string]
                                const left = Number(it.quantity || 0) - row.restock - row.damaged
                                return `• ${lineTitle.get(it.item_id as string) || "Ürün"}: ${row.restock} stoğa, ${row.damaged} hasarlı, ${left} kabul edilmedi`
                              })
                              .join("\n")
                            const ship = shipById[r.id] && shippingTotal > 0
                            const exchange = Boolean(r.metadata?.escay_exchange && r.metadata.escay_exchange.status !== "canceled")
                            const ok = window.confirm(
                              exchange
                                ? `${summary}\n\nDEĞİŞİM: para iadesi yapılmaz; kabul edilen adet kadar yeni ürünün gönderisi otomatik açılır. Devam?`
                                : `${summary}${ship ? `\n• Kargo ücreti de iade edilecek: ${shippingTotal.toFixed(2)} TL` : ""}\n\nKabul edilen ürünlerin parası müşterinin kartına OTOMATİK iade edilir (havale siparişinde elle). Kabul edilmeyenler için para iadesi yapılmaz. Devam?`
                            )
                            if (ok) receiveMut.mutate({ ret: r, rows, reason: partialReasonById[r.id] || "", refundShipping: Boolean(ship) })
                          }}
                        >
                          {rejectedQty > 0 ? "Seçilenleri teslim al ve parasını iade et" : "Paket geldi — teslim al ve parayı iade et"}
                        </Button>
                      </div>
                    )
                  })()
                : null}
              {rejected && r.metadata?.escay_rejection?.reason ? (
                <Text size="small" className="text-ui-fg-subtle">
                  Sebep: {r.metadata.escay_rejection.reason}
                </Text>
              ) : null}
              {r.metadata?.paytr_refund?.status === "failed" ? (
                r.metadata.paytr_refund.manual_required ? (
                  <Text size="small" className="text-ui-fg-error">
                    Ödeme PayTR ile alınmamış (havale).{" "}
                    {(r.metadata.paytr_refund.amount ?? 0).toFixed(2)} TL&apos;yi
                    müşterinin IBAN&apos;ına havale edin, Paraşüt&apos;te iade
                    faturasını elle kesin ve müşteriye bilgi verin.
                  </Text>
                ) : (
                  <>
                    <Text size="small" className="text-ui-fg-error">
                      {(r.metadata.paytr_refund.amount ?? 0).toFixed(2)} TL
                      iade edilemedi: {r.metadata.paytr_refund.error || "bilinmiyor"}
                    </Text>
                    <Button
                      variant="secondary"
                      size="small"
                      isLoading={
                        retryMut.isPending &&
                        retryMut.variables?.returnId === r.id
                      }
                      onClick={() => retryMut.mutate({ returnId: r.id })}
                    >
                      Para iadesini tekrar dene
                    </Button>
                  </>
                )
              ) : null}
              {canReject ? (
                <>
                  <Input
                    placeholder="Red sebebi (müşteriye görünür, opsiyonel)"
                    value={reasonById[r.id] || ""}
                    onChange={(e) =>
                      setReasonById((prev) => ({
                        ...prev,
                        [r.id]: e.target.value,
                      }))
                    }
                  />
                  <Button
                    variant="danger"
                    size="small"
                    isLoading={
                      rejectMut.isPending &&
                      rejectMut.variables?.returnId === r.id
                    }
                    onClick={() =>
                      rejectMut.mutate({
                        returnId: r.id,
                        reason: reasonById[r.id] || "",
                      })
                    }
                  >
                    Reddet (para iadesi yapılmaz)
                  </Button>
                </>
              ) : null}
            </div>
          )
        })}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default ReturnRejectWidget
