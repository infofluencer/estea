import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

/** src/lib/order-contracts.ts ORDER_CONTRACTS ile aynı (o dosya sunucu tarafı, buraya import edilmez). */
const CONTRACTS = [
  { kind: "on-bilgilendirme-formu", label: "Ön bilgilendirme formu" },
  { kind: "mesafeli-satis-sozlesmesi", label: "Mesafeli satış sözleşmesi" },
] as const

type ContractsMeta = {
  source?: string
  generated_at?: string
  legal_accepted_at?: string | null
  backfilled?: boolean
  text_version?: string
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

/**
 * Sipariş detayı — yeni sistemin sözleşme PDF'leri (S3 contracts/<sipariş>/).
 * PDF'ler sipariş anında üretilir (order.placed → order-contracts.ts).
 */
const OrderContractsWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["escay-order-contracts", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}?fields=id,metadata`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as {
        order?: { metadata?: { contracts?: ContractsMeta; legal_accepted_at?: string; source?: string } | null }
      }
      return body.order?.metadata ?? null
    },
  })

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}/contracts`, {
        method: "POST",
        credentials: "include",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`)
      return body as { skipped?: string }
    },
    onSuccess: (body) => {
      setMsg(body.skipped ? "Zaten oluşturulmuş." : "Oluşturuldu.")
      void qc.invalidateQueries({ queryKey: ["escay-order-contracts", orderId] })
    },
    onError: (err) => setMsg(err instanceof Error ? err.message : String(err)),
  })

  if (!orderId) return null

  const meta = data?.contracts?.source === "medusa" ? data.contracts : null
  const accepted = meta?.legal_accepted_at ?? data?.legal_accepted_at ?? null

  return (
    <Container className="flex flex-col gap-y-3 p-4">
      <div className="flex items-center justify-between gap-x-2">
        <Heading level="h2">Sözleşmeler</Heading>
        {meta ? (
          <Badge size="2xsmall" color={meta.backfilled ? "orange" : "green"}>
            {meta.backfilled ? "Yeni sistem · sonradan" : "Yeni sistem"}
          </Badge>
        ) : null}
      </div>

      {isLoading ? (
        <Text size="small" className="text-ui-fg-subtle">
          Yükleniyor…
        </Text>
      ) : meta ? (
        <>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {meta.backfilled
              ? "Bu siparişin sözleşmeleri sipariş kaydındaki bilgilerden sonradan oluşturuldu."
              : "Yeni sistemde, sipariş anında siparişin kendi bilgileriyle oluşturuldu."}{" "}
            Oluşturma: {fmt(meta.generated_at)} · Müşteri onayı: {fmt(accepted)}
          </Text>
          {CONTRACTS.map((c) => (
            <a
              key={c.kind}
              href={`/admin/orders/${orderId}/contracts/${c.kind}`}
              target="_blank"
              rel="noreferrer"
              className="txt-small text-ui-fg-interactive"
            >
              {c.label} — PDF'i aç
            </a>
          ))}
        </>
      ) : (
        <>
          <Text size="small" className="text-ui-fg-subtle">
            Bu siparişte kayıtlı sözleşme PDF'i yok. Müşteri onayı: {fmt(accepted)}
          </Text>
          <Button
            size="small"
            variant="secondary"
            isLoading={generate.isPending}
            onClick={() => {
              setMsg(null)
              generate.mutate()
            }}
          >
            Sözleşmeleri oluştur
          </Button>
        </>
      )}
      {msg ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {msg}
        </Text>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderContractsWidget
