import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
// Havale kapalı (2026-11-07) — bkz. medusa-config.ts payment providers.
// import { bankTransferInfo } from "../../../lib/bank-transfer"

/**
 * GET /store/bank-transfer — checkout'ta havale seçeneği.
 * Kapalıysa (BANK_TRANSFER_ENABLED≠1 ya da IBAN/hesap sahibi boş) enabled=false.
 */
export const GET = async (_req: MedusaRequest, res: MedusaResponse) => {
  // const info = bankTransferInfo()
  // res.status(200).json(info ? { enabled: true, ...info } : { enabled: false })
  res.status(200).json({ enabled: false })
}
