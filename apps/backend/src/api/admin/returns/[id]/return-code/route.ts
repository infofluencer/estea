import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { sendReturnCodeToCustomer } from "../../../../../lib/return-code"
import { isReturnRejected } from "../../../../../lib/return-rejection"

/**
 * Admin: POST /admin/returns/:id/return-code  { code }
 *
 * Kargo firmasının panelinde açılan kodlu iade kodunu iadeye yazar ve müşteriye
 * "iade kodu ile şubeye verin" mailini gönderir. Kod değişirse yeniden
 * gönderilebilir (aynı kod ikinci kez mail atmaz).
 */
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const returnId = req.params.id
  const raw = String(((req.body || {}) as { code?: unknown }).code ?? "").trim()
  const code = raw.replace(/\s+/g, "")
  if (!returnId || !/^[A-Za-z0-9-]{4,40}$/.test(code)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Geçerli bir iade kodu girin (harf/rakam, 4–40 karakter).")
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "return",
    fields: ["id", "status", "order_id", "metadata"],
    filters: { id: returnId },
  })
  const ret = (data as { id: string; status?: string; order_id?: string; metadata?: Record<string, unknown> | null }[])[0]
  if (!ret) throw new MedusaError(MedusaError.Types.NOT_FOUND, "İade bulunamadı")
  if (ret.status !== "requested" || isReturnRejected(ret.metadata)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Kod yalnız bekleyen (teslim alınmamış) iadeye gönderilir.")
  }

  let email: string
  try {
    ;({ email } = await sendReturnCodeToCustomer(req.scope, {
      returnId,
      orderId: ret.order_id,
      code,
      source: "manual",
      actorId: req.auth_context?.actor_id || null,
    }))
  } catch (error) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, error instanceof Error ? error.message : String(error))
  }

  res.json({ ok: true, code, email })
}
