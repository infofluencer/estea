import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"
import { useState } from "react"

type InvoiceMeta = {
  status?: string
  mode?: string
  invoice_number?: string
  invoice_type?: "e_archive" | "e_invoice"
  pdf_url?: string
  error?: string
  at?: string
  retry_count?: number
}

type RefundMeta = {
  status?: string
  return_id?: string
  invoice_number?: string
  amount?: number
  pdf_url?: string
  error?: string
}

type OrderPayload = {
  order?: {
    id?: string
    metadata?: {
      parasut_invoice?: InvoiceMeta
      parasut_refund_invoices?: Record<string, RefundMeta>
    } | null
  }
}

function statusBadge(
  status?: string
): { label: string; color: "green" | "orange" | "red" | "grey" } {
  switch (status) {
    case "issued":
      return { label: "Kesildi", color: "green" }
    case "pending":
      return { label: "Bekliyor", color: "orange" }
    case "error":
      return { label: "Hata", color: "red" }
    case "skipped":
      return { label: "Atlandı", color: "grey" }
    case "canceled":
      return { label: "İptal", color: "grey" }
    case "draft_dryrun":
      return { label: "DRY-RUN taslak", color: "orange" }
    default:
      return { label: status || "Yok", color: "grey" }
  }
}

function typeLabel(t?: string): string {
  if (t === "e_invoice") return "e-Fatura"
  if (t === "e_archive") return "e-Arşiv"
  return "—"
}

/**
 * Sipariş detayı — Parasut fatura durumu (yasal görünürlük).
 * metadata.parasut_invoice + parasut_refund_invoices.
 */
const ParasutInvoiceWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const [retryMsg, setRetryMsg] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["escay-order-parasut", orderId],
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
    mutationFn: async () => {
      const res = await fetch(
        `/admin/orders/${orderId}/parasut-invoice/retry`,
        { method: "POST", credentials: "include" }
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
      if (body.meta?.status === "issued") {
        setRetryMsg(
          body.skipped
            ? "Zaten kesilmiş (idempotent)."
            : `Kesildi: ${body.meta.invoice_number || "OK"}`
        )
      } else if (body.meta?.status === "error") {
        setRetryMsg(`Hata: ${body.meta.error || "bilinmiyor"}`)
      } else {
        setRetryMsg(`Durum: ${body.meta?.status || "?"}`)
      }
      void qc.invalidateQueries({ queryKey: ["escay-order-parasut", orderId] })
    },
    onError: (err) => {
      setRetryMsg(err instanceof Error ? err.message : String(err))
    },
  })

  if (!orderId) return null

  const inv = data?.order?.metadata?.parasut_invoice
  const refunds = Object.values(
    data?.order?.metadata?.parasut_refund_invoices || {}
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
  const canRetry =
    !inv ||
    inv.status === "error" ||
    inv.status === "pending" ||
    inv.status === undefined

  return (
    <Container className="p-4">
      <Heading level="h2" className="mb-2">
        Es Çay — Fatura (Paraşüt)
      </Heading>
      <Text size="small" className="text-ui-fg-subtle mb-3 block">
        e-Arşiv / e-Fatura. Kesilmeyen sipariş yasal risktir.
      </Text>

      <div className="rounded-md border border-ui-border-base p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={st.color}>{st.label}</Badge>
          {inv?.mode ? (
            <Badge color={inv.mode === "mock" ? "orange" : "green"}>
              {inv.mode === "mock" ? "mock" : "canlı"}
            </Badge>
          ) : null}
          {inv?.invoice_type ? (
            <Badge color="grey">{typeLabel(inv.invoice_type)}</Badge>
          ) : null}
        </div>

        {!inv ? (
          <Text size="small" className="text-ui-fg-subtle">
            Henüz fatura kaydı yok (ödeme sonrası kesilir).
          </Text>
        ) : (
          <>
            {inv.invoice_number ? (
              <Text size="small">
                Fatura no:{" "}
                <span className="font-mono">{inv.invoice_number}</span>
              </Text>
            ) : null}
            {inv.pdf_url ? (
              <Text size="small">
                <a
                  href={inv.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ui-fg-interactive underline"
                >
                  PDF indir
                </a>
              </Text>
            ) : null}
            {inv.status === "error" && inv.error ? (
              <Text size="small" className="text-ui-fg-error">
                Hata: {inv.error}
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

        {canRetry ? (
          <div className="pt-2">
            <Button
              size="small"
              variant="secondary"
              disabled={retryMut.isPending}
              onClick={() => {
                setRetryMsg(null)
                retryMut.mutate()
              }}
            >
              {retryMut.isPending ? "Kesiliyor…" : "Yeniden kes"}
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
            const key = r.return_id || r.invoice_number || "refund"
            return (
              <div
                key={key}
                className="rounded-md border border-ui-border-base p-2 space-y-1"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge color={rs.color}>{rs.label}</Badge>
                  {r.invoice_number ? (
                    <Text size="small" className="font-mono">
                      {r.invoice_number}
                    </Text>
                  ) : null}
                </div>
                {typeof r.amount === "number" ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    Tutar: {r.amount.toFixed(2)} TRY
                  </Text>
                ) : null}
                {r.status === "error" && r.error ? (
                  <Text size="small" className="text-ui-fg-error">
                    {r.error}
                  </Text>
                ) : null}
                {r.pdf_url ? (
                  <Text size="small">
                    <a
                      href={r.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ui-fg-interactive underline"
                    >
                      PDF
                    </a>
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
  zone: "order.details.side.after",
})

export default ParasutInvoiceWidget
