/**
 * Havale / EFT sağlayıcısını (pp_havale_havale) Türkiye bölgesine bağlar.
 * İdempotent — zaten bağlıysa dokunmaz. Mevcut sağlayıcılar (PayTR vb.) korunur.
 *
 * Checkout'ta görünmesi için ayrıca BANK_TRANSFER_ENABLED=1 + IBAN + hesap sahibi gerekir.
 *
 * Run (local):  npm run enable:bank-transfer
 * Run (Docker): docker exec BACK npm run enable:bank-transfer:prod
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"
import { BANK_TRANSFER_PROVIDER_ID } from "../lib/bank-transfer"

type RegionRow = {
  id: string
  name?: string | null
  countries?: { iso_2?: string | null }[] | null
  payment_providers?: { id: string }[] | null
}

export default async function enableBankTransfer({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
    filters: { id: BANK_TRANSFER_PROVIDER_ID },
  })
  if (!providers?.length) {
    throw new Error(
      `${BANK_TRANSFER_PROVIDER_ID} kayıtlı değil — medusa-config.ts'deki provider ile backend en az bir kez açılmış olmalı.`
    )
  }

  const { data } = await query.graph({
    entity: "region",
    fields: ["id", "name", "countries.iso_2", "payment_providers.id"],
  })
  const regions = (data as RegionRow[]).filter((r) =>
    (r.countries || []).some((c) => c.iso_2 === "tr")
  )
  if (!regions.length) throw new Error("Türkiye bölgesi bulunamadı.")

  for (const region of regions) {
    const current = (region.payment_providers || []).map((p) => p.id)
    if (current.includes(BANK_TRANSFER_PROVIDER_ID)) {
      logger.info(`[enable-bank-transfer] ${region.name} (${region.id}) zaten bağlı`)
      continue
    }
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...current, BANK_TRANSFER_PROVIDER_ID] },
      },
    })
    logger.info(
      `[enable-bank-transfer] ${region.name} (${region.id}) → ${[...current, BANK_TRANSFER_PROVIDER_ID].join(", ")}`
    )
  }
}
