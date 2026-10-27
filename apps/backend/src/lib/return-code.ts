import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { buildReturnCodeCustomerEmail } from "../emails/return-notifications"
import { recordOpsEvent } from "./ops-events"
import { loadReturnEmailContext } from "./return-email-context"
import { createNotificationIdempotent } from "./notify"

export type ReturnCodeSource = "manual" | "carrier"

/** İadeye "müşteriye giden iade kodu" yazar (panel: "İade kodu gönderilmedi" kalkar). */
export async function markReturnCodeSent(
  container: MedusaContainer,
  returnId: string,
  code: string,
  source: ReturnCodeSource
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "return", fields: ["id", "metadata"], filters: { id: returnId } })
  const meta = ((data?.[0] as { metadata?: Record<string, unknown> | null } | undefined)?.metadata || {}) as Record<string, unknown>
  await container.resolve(Modules.ORDER).updateReturns([
    {
      selector: { id: returnId },
      data: {
        metadata: {
          ...meta,
          return_code: code,
          return_code_sent_at: new Date().toISOString(),
          return_code_source: source,
        },
      },
    },
  ])
}

/**
 * Müşteriye "iade kodu ile kargo şubesine verin" maili → kodu iadeye yazar → olay.
 * Aynı kod ikinci kez mail atmaz (idempotency_key).
 */
export async function sendReturnCodeToCustomer(
  container: MedusaContainer,
  input: { returnId: string; orderId?: string | null; code: string; source: ReturnCodeSource; actorId?: string | null }
): Promise<{ email: string }> {
  const ctx = await loadReturnEmailContext(container, input.returnId)
  if (!ctx?.email) throw new Error("Siparişte müşteri e-postası yok.")

  const mail = buildReturnCodeCustomerEmail({ orderDisplayId: ctx.orderDisplayId, code: input.code, items: ctx.items })
  await createNotificationIdempotent(container.resolve(Modules.NOTIFICATION), {
    to: ctx.email,
    channel: "email",
    template: "return-code-customer",
    content: { subject: mail.subject, html: mail.html, text: mail.text },
    resource_id: input.returnId,
    resource_type: "return",
    idempotency_key: `return-code:${input.returnId}:${input.code}`,
  })

  // Mail gittikten SONRA işaretle: SMTP hatasında panel "gönderildi" göstermesin.
  await markReturnCodeSent(container, input.returnId, input.code, input.source)

  await recordOpsEvent(container, {
    kind: "return.code_sent",
    level: "info",
    title: `İade kodu müşteriye gönderildi: ${input.code}`,
    orderId: input.orderId || ctx.orderId || null,
    data: { return_id: input.returnId, code: input.code, source: input.source, by: input.actorId || null },
  })
  return { email: ctx.email }
}
