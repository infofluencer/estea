import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

type InvoiceMeta = {
  status?: string
  mode?: string
  guid?: string
  url?: string
  invoice_no?: string
  total?: number
  error?: string
  at?: string
  retry_count?: number
}

type RefundMeta = {
  status?: string
  return_id?: string
  amount?: number
}

type OrderPayload = {
  order?: {
    id?: string
    metadata?: {
      bizimhesap_invoice?: InvoiceMeta
      bizimhesap_refund_invoices?: Record<string, RefundMeta>
    } | null
  }
}

function statusBadge(
  status?: string
): { label: string; color: "green" | "orange" | "red" | "grey" } {
  switch (status) {
    case "created":
      return { label: "BizimHesap'a işlendi", color: "green" }
    case "pending":
      return { label: "Gönderiliyor", color: "orange" }
    case "unknown":
      return { label: "Belirsiz, kontrol edin", color: "red" }
    case "error":
      return { label: "Hata", color: "red" }
    case "skipped":
      return { label: "Atlandı", color: "grey" }
    case "dry_run":
      return { label: "DRY-RUN, gönderilmedi", color: "orange" }
    case "manual_required":
      return { label: "Panelden elle kesilecek", color: "orange" }
    default:
      return { label: status || "Yok", color: "grey" }
  }
}

/**
 * Sipariş detayı — BizimHesap fatura durumu (yasal görünürlük).
 * metadata.bizimhesap_invoice + bizimhesap_refund_invoices.
 */
const BizimhesapInvoiceWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const [retryMsg, setRetryMsg] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["escay-order-bizimhesap", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}?fields=id,metadata`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<OrderPayload>
    },
  })

  const retryMut = useMutation({
    mutationFn: async (confirmNotInBizimhesap: boolean) => {
      const res = await fetch(
        `/admin/orders/${orderId}/bizimhesap-invoice/retry`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirm_not_in_bizimhesap: confirmNotInBizimhesap,
          }),
        }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.message || `HTTP ${res.status}`)
      }
      return body as {
        ok: boolean
        skipped?: boolean
        meta?: InvoiceMeta
      }
    },
    onSuccess: (body) => {
      if (body.meta?.status === "created") {
        setRetryMsg(body.skipped ? "Zaten işlenmiş." : "BizimHesap'a işlendi.")
      } else if (body.meta?.status === "error" || body.meta?.status === "unknown") {
        setRetryMsg(`Hata: ${body.meta.error || "bilinmiyor"}`)
      } else {
        setRetryMsg(`Durum: ${body.meta?.status || "?"}`)
      }
      void qc.invalidateQueries({ queryKey: ["escay-order-bizimhesap", orderId] })
    },
    onError: (err) => {
      setRetryMsg(err instanceof Error ? err.message : String(err))
    },
  })

  if (!orderId) return null

  const inv = data?.order?.metadata?.bizimhesap_invoice
  const refunds = Object.values(
    data?.order?.metadata?.bizimhesap_refund_invoices || {}
  )

  if (isLoading) {
    return (
      <Container className="p-4">
        <Text size="small" className="text-ui-fg-subtle">
          Fatura durumu yükleniyor…
        </Text>
      </Container>
    )
  }

  const st = statusBadge(inv?.status)
  const uncertain = inv?.status === "unknown" || inv?.status === "pending"
  const canSend = !inv || inv.status === "error"

  return (
    <Container className="p-4">
      <Heading level="h2" className="mb-2">
        Es Çay — Fatura (BizimHesap)
      </Heading>
      <Text size="small" className="text-ui-fg-subtle mb-3 block">
        Kayıt sipariş teslim edilince açılır. e-Arşiv / e-Fatura gönderimini BizimHesap panelinden izleyin.
      </Text>

      <div className="rounded-md border border-ui-border-base p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={st.color}>{st.label}</Badge>
          {inv?.mode ? (
            <Badge color={inv.mode === "mock" ? "orange" : "green"}>
              {inv.mode === "mock" ? "mock" : "canlı"}
            </Badge>
          ) : null}
        </div>

        {!inv ? (
          <Text size="small" className="text-ui-fg-subtle">
            Henüz fatura kaydı yok (teslimden sonra açılır).
          </Text>
        ) : (
          <>
            {inv.invoice_no ? (
              <Text size="small">
                Belge no: <span className="font-mono">{inv.invoice_no}</span>
              </Text>
            ) : null}
            {typeof inv.total === "number" ? (
              <Text size="small" className="text-ui-fg-subtle">
                Tutar: {inv.total.toFixed(2)} TRY
              </Text>
            ) : null}
            {inv.url ? (
              <Text size="small">
                <a
                  href={inv.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ui-fg-interactive underline"
                >
                  BizimHesap'ta aç
                </a>
              </Text>
            ) : null}
            {inv.error ? (
              <Text size="small" className="text-ui-fg-error">
                {inv.error}
              </Text>
            ) : null}
            {typeof inv.retry_count === "number" && inv.retry_count > 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                Retry: {inv.retry_count}
              </Text>
            ) : null}
            {inv.at ? (
              <Text size="small" className="text-ui-fg-subtle">
                {new Date(inv.at).toLocaleString("tr-TR")}
              </Text>
            ) : null}
          </>
        )}

        {canSend || uncertain ? (
          <div className="pt-2">
            <Button
              size="small"
              variant="secondary"
              disabled={retryMut.isPending}
              onClick={() => {
                if (
                  uncertain &&
                  !window.confirm(
                    `BizimHesap panelinde ${inv?.invoice_no || "bu sipariş"} için kayıt olmadığını kontrol ettiniz mi? Kayıt varsa çift fatura oluşur.`
                  )
                ) {
                  return
                }
                setRetryMsg(null)
                retryMut.mutate(uncertain)
              }}
            >
              {retryMut.isPending
                ? "Gönderiliyor…"
                : uncertain
                  ? "Panelde yok, yeniden gönder"
                  : "Yeniden gönder"}
            </Button>
            {retryMsg ? (
              <Text size="small" className="mt-1 block text-ui-fg-subtle">
                {retryMsg}
              </Text>
            ) : null}
          </div>
        ) : null}
      </div>

      {refunds.length > 0 ? (
        <div className="mt-3 space-y-2">
          <Text size="small" className="font-medium">
            İade faturaları
          </Text>
          {refunds.map((r) => {
            const rs = statusBadge(r.status)
            return (
              <div
                key={r.return_id || "refund"}
                className="rounded-md border border-ui-border-base p-2 space-y-1"
              >
                <Badge color={rs.color}>{rs.label}</Badge>
                {typeof r.amount === "number" ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    Tutar: {r.amount.toFixed(2)} TRY
                  </Text>
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
  id: "escay-order-invoice",
  zone: "order.details.side.after",
})

export default BizimhesapInvoiceWidget
