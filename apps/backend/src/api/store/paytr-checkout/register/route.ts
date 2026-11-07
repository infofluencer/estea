import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { PaytrCheckoutError, registerPaytrCheckout } from "../../../../lib/paytr-checkout"

/**
 * POST /store/paytr-checkout/register { cart_id, iframe_token? }
 * iframe gösterilmeden önce çağrılır: ödeme denemesinin kalıcı kaydını açar.
 * iframe_token verilirse kayıt o token'ın oturumuna yazılır; sepetin oturumu
 * değişmişse (ikinci sekme) 409 "stale_token" döner ve mağaza ödemeyi yeniden başlatır.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body as { cart_id?: unknown; iframe_token?: unknown } | undefined) || {}
  const cartId = String(body.cart_id || "").trim()
  const iframeToken =
    typeof body.iframe_token === "string" && body.iframe_token.trim()
      ? body.iframe_token.trim()
      : null
  if (!cartId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "cart_id gerekli.")
  }
  try {
    const checkout = await registerPaytrCheckout(req.scope, cartId, iframeToken)
    res.status(200).json({ merchant_oid: checkout.merchant_oid })
  } catch (err) {
    if (err instanceof PaytrCheckoutError) {
      if (err.code === "stale_token") {
        res.status(409).json({ code: "stale_token", message: err.message })
        return
      }
      throw new MedusaError(
        err.code === "not_found" ? MedusaError.Types.NOT_FOUND : MedusaError.Types.NOT_ALLOWED,
        err.message
      )
    }
    throw err
  }
}
