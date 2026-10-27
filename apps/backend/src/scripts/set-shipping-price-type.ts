/**
 * carrier_carrier'a bağlı checkout kargo seçeneklerinin fiyat tipini değiştirir.
 *
 *   calculated → ücret adaptörün quote()'undan (yoksa SHIPPING_FALLBACK_PRICE)
 *   flat       → sabit ücret (SHIPPING_FLAT_PRICE, varsayılan 149.90) — geri dönüş
 *
 * Varsayılan DRY-RUN (mevcut seçenekleri listeler). Yazmak için:
 *   SHIPPING_PRICE_TYPE=calculated SHIPPING_PRICE_TYPE_APPLY=1 npx medusa exec ./src/scripts/set-shipping-price-type.js
 *   SHIPPING_PRICE_TYPE=flat       SHIPPING_PRICE_TYPE_APPLY=1 npx medusa exec ./src/scripts/set-shipping-price-type.js
 *
 * Not: seed-escay yeniden çalıştırılırsa seçenek tekrar flat olur.
 */
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

import { CARRIER_PROVIDER_ID } from "../modules/carrier/types"

export default async function setShippingPriceType({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const target = (process.env.SHIPPING_PRICE_TYPE || "").trim().toLowerCase()
  const apply = process.env.SHIPPING_PRICE_TYPE_APPLY === "1"
  const flatAmount = Number(process.env.SHIPPING_FLAT_PRICE || 149.9)

  if (target && target !== "calculated" && target !== "flat") {
    throw new Error(`SHIPPING_PRICE_TYPE "calculated" veya "flat" olmalı (gelen: ${target})`)
  }

  const { data: options } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "price_type",
      "provider_id",
      "rules.attribute",
      "rules.value",
      "prices.amount",
      "prices.currency_code",
    ],
    filters: { provider_id: CARRIER_PROVIDER_ID },
  })

  const checkoutOptions = (options as any[]).filter(
    (o) =>
      !(o.rules || []).some(
        (r: any) => r?.attribute === "is_return" && String(r?.value) === "true"
      )
  )

  for (const o of checkoutOptions) {
    const prices = (o.prices || [])
      .map((p: any) => `${p.amount} ${p.currency_code ?? "(bölge)"}`)
      .join(", ")
    logger.info(
      `[set-shipping-price-type] ${o.id} "${o.name}" price_type=${o.price_type} fiyatlar=[${prices}]`
    )
  }

  if (!target) {
    logger.info(
      "[set-shipping-price-type] DRY-RUN. Değiştirmek için SHIPPING_PRICE_TYPE=calculated|flat " +
        "ve SHIPPING_PRICE_TYPE_APPLY=1 verin."
    )
    return
  }

  const toChange = checkoutOptions.filter((o) => o.price_type !== target)
  logger.info(
    `[set-shipping-price-type] hedef=${target} değişecek=${toChange.length} ` +
      `mode=${apply ? "APPLY" : "DRY-RUN"}`
  )
  if (!apply || !toChange.length) {
    return
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const tryRegions = (regions as any[]).filter((r) => r.currency_code === "try")

  await updateShippingOptionsWorkflow(container).run({
    input: toChange.map((o) =>
      target === "calculated"
        ? { id: o.id, price_type: "calculated" as const }
        : {
            id: o.id,
            price_type: "flat" as const,
            prices: [
              { currency_code: "try", amount: flatAmount },
              ...tryRegions.map((r) => ({ region_id: r.id, amount: flatAmount })),
            ],
          }
    ),
  })

  logger.info(
    `[set-shipping-price-type] ${toChange.map((o) => o.id).join(", ")} → ${target}` +
      (target === "flat" ? ` (${flatAmount} TL)` : "")
  )
}
