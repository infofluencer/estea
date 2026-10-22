import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listTrCities } from "@escay/shared/tr-address"
import { TR_DISTRICTS } from "@escay/shared/tr-districts"

/**
 * GET /admin/tr-geo — 81 il + ilçeler (admin formları için).
 * shared/*.js CommonJS derlendiğinden admin (Vite) doğrudan import edemiyor.
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, max-age=86400")
  res.json({ cities: listTrCities(), districts: TR_DISTRICTS })
}
