/**
 * Admin "İadeler" sayfası — iade kaydının tek bakışta durumu.
 * Sıra önemli: red > para iadesi sonucu > Medusa iade durumu.
 */
import { isReturnRejected } from "./return-rejection"

export type AdminReturnState =
  | "open"
  | "received"
  | "refunded"
  | "problem"
  | "rejected"
  | "canceled"

export function classifyReturn(input: {
  status?: string | null
  metadata?: Record<string, unknown> | null
}): AdminReturnState {
  if (isReturnRejected(input.metadata)) return "rejected"
  const refund = (input.metadata?.paytr_refund || null) as { status?: string } | null
  if (refund?.status === "failed") return "problem"
  if (refund?.status === "success") return "refunded"
  const status = (input.status || "").toLowerCase()
  if (status === "canceled") return "canceled"
  if (status === "received" || status === "partially_received") return "received"
  return "open"
}

export const ADMIN_RETURN_STATES: AdminReturnState[] = [
  "open",
  "received",
  "refunded",
  "problem",
  "rejected",
  "canceled",
]
