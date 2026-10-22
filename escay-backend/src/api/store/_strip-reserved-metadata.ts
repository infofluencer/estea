import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

/**
 * Store API metadata'sı istemciden gelir ama bazı anahtarlar sunucu tarafında
 * karar veriyor. Sepet metadata'sı siparişe kopyalanır (completeCartWorkflow):
 * - source → satış istatistiği / pazarlama davranışı (yalnızca sunucu yazar)
 * Satır metadata'sındaki ağırlık/boyut → kargo fiyatı ve gerçek gönderi paketi.
 * Bu anahtarlar yalnızca sunucu (import, admin) tarafından yazılır; istekten silinir.
 *
 * İstemcinin yazabildiği sepet anahtarları: payment_method, marketing_consent,
 * tracking_consent, legal_accepted_at, order_note.
 */
const CART_RESERVED = new Set(["source"])
const LINE_ITEM_RESERVED = new Set(["weight_kg", "weight_g", "weight", "length", "width", "height"])

function strip(metadata: unknown, isReserved: (key: string) => boolean): void {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return
  for (const key of Object.keys(metadata)) {
    if (isReserved(key)) delete (metadata as Record<string, unknown>)[key]
  }
}

function makeStripper(isReserved: (key: string) => boolean) {
  return (req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) => {
    strip((req.body as { metadata?: unknown } | undefined)?.metadata, isReserved)
    strip((req as { validatedBody?: { metadata?: unknown } }).validatedBody?.metadata, isReserved)
    next()
  }
}

export const stripReservedCartMetadata = makeStripper((key) => CART_RESERVED.has(key))
export const stripReservedLineItemMetadata = makeStripper((key) => LINE_ITEM_RESERVED.has(key))
