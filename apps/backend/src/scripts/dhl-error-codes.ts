/**
 * DHL Apizone hata kodu kataloğu (utilityapi/getapierrorcodes) — salt okuma.
 * Kimlikler gelince bir kez çalıştırın; çıktı docs/dhl-apizone/error-codes.json'a yazılır
 * ve adaptörün hata sınıflandırması (adapters/dhl/errors.ts) buna göre gözden geçirilir.
 *
 *   npm run dhl:error-codes          (DHL_* env; Utility aboneliği gerekir)
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DhlClient, unwrapList } from "../modules/carrier/adapters/dhl/client"
import { missingDhlCredentials, readDhlOptions } from "../modules/carrier/adapters/dhl"

export default async function dhlErrorCodes({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (m: string) => void }
  const o = readDhlOptions()
  const missing = missingDhlCredentials(o)
  if (missing.length) throw new Error(`DHL kimlikleri eksik: ${missing.join(", ")}`)
  const client = new DhlClient(o)
  const rows = unwrapList<{ code?: string; description?: string; errorType?: number }>(await client.getApiErrorCodes())
  const out = join(process.cwd(), "../../docs/dhl-apizone/error-codes.json")
  mkdirSync(join(out, ".."), { recursive: true })
  writeFileSync(out, JSON.stringify({ env: o.env, fetched_at: new Date().toISOString(), codes: rows }, null, 1))
  logger.info(`[dhl-error-codes] ${rows.length} kod (${o.env}) → ${out}`)
}
