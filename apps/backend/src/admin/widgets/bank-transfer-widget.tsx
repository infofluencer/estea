import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "react-router-dom"

type BankTransferState = {
  is_bank_transfer: boolean
  state: "pending" | "received" | "canceled" | null
  amount: number | null
  currency_code: string | null
  received_at: string | null
}

function formatTry(amount: number | null): string {
  if (amount == null) return "—"
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount)
}

const BADGE: Record<string, { label: string; color: "green" | "orange" | "grey" }> = {
  pending: { label: "Ödeme bekleniyor", color: "orange" },
  received: { label: "Ödeme alındı", color: "green" },
  canceled: { label: "Sipariş iptal", color: "grey" },
}

/**
 * Sipariş detayı — Havale / EFT. Yalnızca havale siparişlerinde görünür.
 * "Havale alındı" → ödeme capture → onay maili + kargo + Paraşüt.
 */
const BankTransferWidget = () => {
  const { id: orderId } = useParams()
  const qc = useQueryClient()
  const prompt = usePrompt()

  const { data } = useQuery({
    queryKey: ["escay-bank-transfer", orderId],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}/bank-transfer`, { credentials: "include" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<BankTransferState>
    },
  })

  const confirmMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/admin/orders/${orderId}/bank-transfer/confirm`, {
        method: "POST",
        credentials: "include",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`)
      return body as BankTransferState
    },
    onSuccess: () => {
      toast.success("Havale onaylandı — onay maili, kargo ve fatura akışı başladı.")
      void qc.invalidateQueries()
      // Kargo gönderisi / fatura arka planda açılır —
      // Etiket ve Kargo kutuları sayfa yenilemeden güncellensin.
      for (const ms of [5_000, 15_000, 30_000, 60_000, 90_000]) {
        window.setTimeout(() => void qc.invalidateQueries(), ms)
      }
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!orderId || !data?.is_bank_transfer) return null

  const badge = BADGE[data.state || ""] || { label: "—", color: "grey" as const }

  const onConfirm = async () => {
    const ok = await prompt({
      title: "Havale alındı mı?",
      description: `${formatTry(data.amount)} tutarın banka hesabına geçtiğini kontrol ettiniz mi? Onaylayınca müşteriye onay maili gider, kargo gönderisi ve fatura oluşturulur. Geri alınamaz.`,
      confirmText: "Evet, ödeme alındı",
      cancelText: "Vazgeç",
    })
    if (ok) confirmMut.mutate()
  }

  return (
    <Container className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Heading level="h2">Havale / EFT</Heading>
        <Badge color={badge.color}>{badge.label}</Badge>
      </div>
      <Text size="small" className="text-ui-fg-subtle block">
        Beklenen tutar: <span className="font-medium text-ui-fg-base">{formatTry(data.amount)}</span>
      </Text>
      {data.state === "pending" ? (
        <>
          <Text size="small" className="text-ui-fg-subtle mt-1 block">
            Açıklamada sipariş numarası olmalı. Tutar ve gönderen adını banka hesabından kontrol edin.
          </Text>
          <Button
            size="small"
            className="mt-3"
            disabled={confirmMut.isPending}
            onClick={() => void onConfirm()}
          >
            {confirmMut.isPending ? "Onaylanıyor…" : "Havale alındı"}
          </Button>
        </>
      ) : null}
      {data.state === "received" && data.received_at ? (
        <Text size="small" className="text-ui-fg-subtle mt-1 block">
          Onay: {new Date(data.received_at).toLocaleString("tr-TR")}
        </Text>
      ) : null}
      {data.state === "received" ? (
        <Text size="small" className="text-ui-fg-subtle mt-1 block">
          İade gerekirse para müşterinin IBAN'ına bankadan elle gönderilir; Medusa yalnızca kaydı tutar.
        </Text>
      ) : null}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default BankTransferWidget
