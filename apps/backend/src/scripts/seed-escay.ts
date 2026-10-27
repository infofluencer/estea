/**
 * Es Çay altyapı seed'i — idempotent (store, region, KDV, kategoriler, kargo, iade sebepleri).
 * Ürünler Admin / CSV import ile girilir (bu script ürün yaratmaz).
 *
 * Kargo: SHIPPING_CARRIER boşsa provider manual_manual (elle kargo), doluysa
 * carrier_carrier (src/modules/carrier). Sabit ücret + ücretsiz kargo eşiği
 * (FREE_SHIPPING_THRESHOLD) — iki ayrı shipping option, kurallarla ayrılır.
 *
 * Run: npm run seed  (prod: npm run setup:turkey:prod)
 */
import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createPricePreferencesWorkflow,
  createProductCategoriesWorkflow,
  createPromotionsWorkflow,
  createRegionsWorkflow,
  createReturnReasonsWorkflow,
  createShippingOptionsWorkflow,
  createTaxRatesWorkflow,
  createTaxRegionsWorkflow,
  deleteRegionsWorkflow,
  deleteShippingOptionsWorkflow,
  deleteTaxRegionsWorkflow,
  updatePricePreferencesWorkflow,
  updateShippingOptionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { configuredCarrierCode, isCarrierConfigured } from "../modules/carrier/registry"
import {
  CARRIER_FULFILLMENT_OPTION_ID,
  CARRIER_PROVIDER_ID,
  MANUAL_PROVIDER_ID,
} from "../modules/carrier/types"

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * Sabit TR kargo ücreti ve ücretsiz kargo eşiği — TODO(K4): tutarları netleştir.
 * SHIPPING_FLAT_PRICE (varsayılan 149,90) · FREE_SHIPPING_THRESHOLD (0 → eşik yok)
 */
const SHIPPING_CONFIG = {
  name: "Standart Kargo",
  amount: envNumber("SHIPPING_FLAT_PRICE", 149.9), // TRY, KDV dahil
  currency: "try",
  freeName: "Ücretsiz Kargo",
  freeOver: envNumber("FREE_SHIPPING_THRESHOLD", 0),
}

/** Çay KDV oranı (%) — TODO(K2): mali müşavir teyidi. PARASUT_DEFAULT_VAT_RATE ile aynı olmalı. */
const KDV_RATE = envNumber("KDV_RATE", 1)

/** Medusa shipping option provider_id = `{identifier}_{config.id}` */
const SHIPPING_PROVIDER_ID = isCarrierConfigured() ? CARRIER_PROVIDER_ID : MANUAL_PROVIDER_ID
const SHIPPING_OPTION_DATA = isCarrierConfigured() ? { id: CARRIER_FULFILLMENT_OPTION_ID } : { id: "manual-standard" }

/** Stable type.code for idempotent match (not shown in storefront name). */
const SHIPPING_TYPE_CODE = "standard_tr"
const FREE_SHIPPING_TYPE_CODE = "free_tr"

/** Storefront return reasons — idempotent by `value`. */
const RETURN_REASONS = [
  {
    // TODO(K5): gıda ürününde cayma istisnaları — ambalajı açılmış ürün iade alınmaz (hukukçu).
    value: "wrong_variant",
    label: "Yanlış gramaj / çeşit seçtim",
    seller_pays_shipping: false,
  },
  {
    value: "changed_mind",
    label: "Vazgeçtim (ambalajı açılmamış)",
    seller_pays_shipping: false,
  },
  {
    value: "wrong_item",
    label: "Yanlış ürün geldi",
    seller_pays_shipping: true,
  },
  {
    value: "defective",
    label: "Ayıplı / hasarlı ürün",
    seller_pays_shipping: true,
  },
  {
    value: "other",
    label: "Diğer",
    seller_pays_shipping: false,
  },
] as const

/**
 * Hoş geldin kuponu — yalnız WELCOME_PROMO_CODE env doluysa oluşturulur
 * (ör. WELCOME_PROMO_CODE=hosgeldin10 WELCOME_PROMO_PERCENT=10). Boşsa kupon yok.
 */
const WELCOME_PROMO_CODE = (process.env.WELCOME_PROMO_CODE || "").trim().toLowerCase()
const WELCOME_PROMO_PERCENT = Number(process.env.WELCOME_PROMO_PERCENT || 10)
const WELCOME_PROMO = {
  code: WELCOME_PROMO_CODE,
  type: "standard" as const,
  status: "active" as const,
  is_automatic: false,
  is_tax_inclusive: true,
  application_method: {
    type: "percentage" as const,
    target_type: "items" as const,
    allocation: "across" as const,
    value: WELCOME_PROMO_PERCENT,
    currency_code: "try",
  },
}

async function ensurePromotions(
  container: ExecArgs["container"],
  query: any,
  logger: any
) {
  if (!WELCOME_PROMO_CODE || !(WELCOME_PROMO_PERCENT > 0)) {
    logger.info("WELCOME_PROMO_CODE boş — hoş geldin kuponu oluşturulmadı")
    return
  }
  const { data: existing } = await query.graph({
    entity: "promotion",
    fields: ["id", "code", "status"],
    filters: { code: WELCOME_PROMO.code },
  })
  if (existing?.length) {
    logger.info(`Promotion already exists: ${WELCOME_PROMO.code}`)
    return
  }

  await createPromotionsWorkflow(container).run({
    input: {
      promotionsData: [WELCOME_PROMO],
    },
  })
  logger.info(
    `Promotion created: ${WELCOME_PROMO.code} (${WELCOME_PROMO.application_method.value}% items)`
  )
}

async function ensureReturnReasons(
  container: ExecArgs["container"],
  query: any,
  logger: any
) {
  const orderModule = container.resolve(Modules.ORDER) as {
    updateReturnReasons: (
      id: string,
      data: { metadata?: Record<string, unknown> | null }
    ) => Promise<unknown>
  }

  const { data: existing } = await query.graph({
    entity: "return_reason",
    fields: ["id", "value", "metadata"],
  })
  const byValue = new Map(
    (existing || []).map((r: { id?: string; value?: string; metadata?: unknown }) => [
      r.value as string,
      r,
    ])
  )

  const missing = RETURN_REASONS.filter((r) => !byValue.has(r.value))
  if (missing.length) {
    await createReturnReasonsWorkflow(container).run({
      input: {
        data: missing.map((r) => ({
          value: r.value,
          label: r.label,
          description: r.label,
          metadata: { seller_pays_shipping: r.seller_pays_shipping },
        })),
      },
    })
    logger.info(
      `Return reasons created: ${missing.map((r) => r.value).join(", ")}`
    )
  }

  // Refresh + upsert metadata on all known reasons (idempotent re-seed)
  const { data: refreshed } = await query.graph({
    entity: "return_reason",
    fields: ["id", "value", "metadata"],
  })
  for (const def of RETURN_REASONS) {
    const row = (refreshed || []).find(
      (r: { value?: string }) => r.value === def.value
    ) as { id?: string; metadata?: Record<string, unknown> | null } | undefined
    if (!row?.id) continue
    const current = row.metadata?.seller_pays_shipping
    if (current === def.seller_pays_shipping) continue
    await orderModule.updateReturnReasons(row.id, {
      metadata: {
        ...(row.metadata || {}),
        seller_pays_shipping: def.seller_pays_shipping,
      },
    })
    logger.info(
      `Return reason metadata updated: ${def.value} seller_pays_shipping=${def.seller_pays_shipping}`
    )
  }

  if (!missing.length) {
    logger.info(`Return reasons OK (${RETURN_REASONS.length})`)
  }
}

async function ensureCategory(
  container: ExecArgs["container"],
  query: any,
  logger: any,
  input: { name: string; handle: string; parent_category_id?: string }
) {
  const { data: existing } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: input.handle },
  })
  if (existing[0]) return existing[0].id as string

  const { result } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [
        {
          name: input.name,
          handle: input.handle,
          parent_category_id: input.parent_category_id,
          is_active: true,
          is_internal: false,
        },
      ],
    },
  })
  logger.info(`Category created: ${input.handle}`)
  return result[0].id as string
}

/** Upsert tax-inclusive preferences — UPDATE if exists, never leave false. */
async function ensureTaxInclusive(
  container: ExecArgs["container"],
  query: any,
  logger: any,
  turkeyRegionId: string
) {
  const targets = [
    { attribute: "currency_code", value: "try" },
    { attribute: "region_id", value: turkeyRegionId },
  ]

  const { data: prefs } = await query.graph({
    entity: "price_preference",
    fields: ["id", "attribute", "value", "is_tax_inclusive"],
  })

  for (const t of targets) {
    const found = (prefs as any[]).find(
      (p) => p.attribute === t.attribute && p.value === t.value
    )
    if (found) {
      if (!found.is_tax_inclusive) {
        logger.info(
          `Updating price_preference ${t.attribute}=${t.value} → tax_inclusive true`
        )
        await updatePricePreferencesWorkflow(container).run({
          input: {
            selector: { id: [found.id] },
            update: { is_tax_inclusive: true },
          },
        })
      } else {
        logger.info(
          `price_preference ${t.attribute}=${t.value} already tax_inclusive`
        )
      }
    } else {
      logger.info(
        `Creating price_preference ${t.attribute}=${t.value} tax_inclusive`
      )
      await createPricePreferencesWorkflow(container).run({
        input: [{ ...t, is_tax_inclusive: true }],
      })
    }
  }
}

/**
 * Stock location'a seçili fulfillment provider'ını bağlar.
 * Shipping option bu provider'a geçince Medusa bu linki ister; yoksa checkout
 * seçeneği listelenmeyebilir veya fulfillment yaratılamaz.
 */
async function ensureProviderOnLocation(
  container: ExecArgs["container"],
  query: any,
  logger: any,
  stockLocationId: string
) {
  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "fulfillment_providers.id"],
    filters: { id: stockLocationId },
  })
  const providers = (locations?.[0]?.fulfillment_providers ?? []) as { id?: string }[]
  if (providers.some((p) => p.id === SHIPPING_PROVIDER_ID)) {
    logger.info(`Stock location already has ${SHIPPING_PROVIDER_ID}`)
    return
  }

  const link = container.resolve(ContainerRegistrationKeys.LINK)
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: SHIPPING_PROVIDER_ID },
  })
  logger.info(`Linked ${SHIPPING_PROVIDER_ID} to stock location ${stockLocationId}`)
}

/**
 * Ensure Türkiye service zone + flat-rate "Standart Kargo" (+ opsiyonel
 * "Ücretsiz Kargo" eşik seçeneği). Adopts existing TR options, updates them,
 * deletes duplicates. Provider SHIPPING_PROVIDER_ID; fiyat flat.
 */
async function ensureTrShipping(
  container: ExecArgs["container"],
  query: any,
  logger: any,
  fulfillmentModuleService: any,
  shippingProfileId: string,
  stockLocationId: string,
  turkeyRegionId: string
) {
  let fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets(
    {},
    { relations: ["service_zones", "service_zones.geo_zones"] }
  )

  if (!fulfillmentSets.length) {
    logger.info("Creating fulfillment set with Türkiye zone...")
    const created = await fulfillmentModuleService.createFulfillmentSets({
      name: "Es Çay Kargo",
      type: "shipping",
      service_zones: [
        {
          name: "Türkiye",
          geo_zones: [{ type: "country", country_code: "tr" }],
        },
      ],
    })
    const link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: stockLocationId },
      [Modules.FULFILLMENT]: { fulfillment_set_id: created.id },
    })
    fulfillmentSets = await fulfillmentModuleService.listFulfillmentSets(
      {},
      { relations: ["service_zones", "service_zones.geo_zones"] }
    )
  }

  let trZone: any = null
  for (const fs of fulfillmentSets) {
    for (const sz of fs.service_zones || []) {
      const isTr =
        sz.name === "Türkiye" ||
        sz.geo_zones?.some((gz: any) => gz.country_code === "tr")
      if (isTr) {
        trZone = sz
        break
      }
    }
    if (trZone) break
  }

  if (!trZone) {
    logger.info("Creating Türkiye service zone...")
    const zones = await fulfillmentModuleService.createServiceZones([
      {
        name: "Türkiye",
        fulfillment_set_id: fulfillmentSets[0].id,
        geo_zones: [{ type: "country", country_code: "tr" }],
      },
    ])
    trZone = zones[0]
  }

  const { data: trOptions } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "service_zone_id",
      "provider_id",
      "price_type",
      "type.code",
      "type.label",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
    ],
    filters: { service_zone_id: trZone.id },
  })

  const options = (trOptions || []) as any[]
  const freeExisting = options.find((o) => o.type?.code === FREE_SHIPPING_TYPE_CODE || o.name === SHIPPING_CONFIG.freeName)
  const prefer =
    options.find((o) => o.type?.code === SHIPPING_TYPE_CODE) ||
    options.find((o) => o.name === SHIPPING_CONFIG.name) ||
    options.find((o) => String(o.name || "").includes("Standart Kargo")) ||
    options.find((o) => o.id !== freeExisting?.id)

  const pricesPayload = [
    {
      currency_code: SHIPPING_CONFIG.currency,
      amount: SHIPPING_CONFIG.amount,
    },
    {
      region_id: turkeyRegionId,
      amount: SHIPPING_CONFIG.amount,
    },
  ]

  const baseRules = [
    { attribute: "enabled_in_store", value: "true", operator: "eq" as const },
    { attribute: "is_return", value: "false", operator: "eq" as const },
  ]
  // Eşik varsa: sabit ücret yalnız eşiğin altında, ücretsiz yalnız eşik ve üstünde görünür.
  const threshold = SHIPPING_CONFIG.freeOver
  const rules = threshold > 0
    ? [...baseRules, { attribute: "item_total", value: String(threshold), operator: "lt" as const }]
    : baseRules

  let keeperId: string

  if (prefer) {
    keeperId = prefer.id as string
    logger.info(
      `Updating TR shipping option ${keeperId} → ${SHIPPING_CONFIG.name} ${SHIPPING_CONFIG.amount} ${SHIPPING_CONFIG.currency}`
    )
    await updateShippingOptionsWorkflow(container).run({
      input: [
        {
          id: keeperId,
          name: SHIPPING_CONFIG.name,
          price_type: "flat",
          provider_id: SHIPPING_PROVIDER_ID,
          shipping_profile_id: shippingProfileId,
          data: SHIPPING_OPTION_DATA,
          type: {
            label: "Standard",
            description: "Türkiye içi standart kargo",
            code: SHIPPING_TYPE_CODE,
          },
          prices: pricesPayload,
          rules,
        },
      ],
    })
  } else {
    logger.info(
      `Creating TR shipping option: ${SHIPPING_CONFIG.name} ${SHIPPING_CONFIG.amount} ${SHIPPING_CONFIG.currency}`
    )
    const { result } = await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: SHIPPING_CONFIG.name,
          price_type: "flat",
          provider_id: SHIPPING_PROVIDER_ID,
          service_zone_id: trZone.id,
          shipping_profile_id: shippingProfileId,
          data: SHIPPING_OPTION_DATA,
          type: {
            label: "Standard",
            description: "Türkiye içi standart kargo",
            code: SHIPPING_TYPE_CODE,
          },
          prices: pricesPayload,
          rules,
        },
      ],
    })
    keeperId = result[0].id as string
  }

  // Ücretsiz kargo seçeneği (eşik ≥ item_total)
  let freeId: string | undefined
  if (threshold > 0) {
    const freeRules = [...baseRules, { attribute: "item_total", value: String(threshold), operator: "gte" as const }]
    const freePayload = {
      name: SHIPPING_CONFIG.freeName,
      price_type: "flat" as const,
      provider_id: SHIPPING_PROVIDER_ID,
      shipping_profile_id: shippingProfileId,
      data: SHIPPING_OPTION_DATA,
      type: { label: "Free", description: `${threshold} TL ve üzeri siparişlerde ücretsiz`, code: FREE_SHIPPING_TYPE_CODE },
      prices: [
        { currency_code: SHIPPING_CONFIG.currency, amount: 0 },
        { region_id: turkeyRegionId, amount: 0 },
      ],
      rules: freeRules,
    }
    if (freeExisting) {
      freeId = freeExisting.id as string
      await updateShippingOptionsWorkflow(container).run({ input: [{ id: freeId, ...freePayload }] })
      logger.info(`Updated free shipping option ${freeId} (≥ ${threshold} TL)`)
    } else {
      const { result } = await createShippingOptionsWorkflow(container).run({
        input: [{ ...freePayload, service_zone_id: trZone.id }],
      })
      freeId = result[0].id as string
      logger.info(`Created free shipping option ${freeId} (≥ ${threshold} TL)`)
    }
  }

  const duplicates = options
    .filter((o) => o.id !== keeperId && o.id !== freeId)
    .map((o) => o.id as string)

  if (duplicates.length) {
    logger.info(
      `Removing ${duplicates.length} duplicate TR shipping option(s): ${duplicates.join(", ")}`
    )
    await deleteShippingOptionsWorkflow(container).run({
      input: { ids: duplicates },
    })
  } else {
    logger.info(`TR shipping OK: ${keeperId} (${SHIPPING_CONFIG.name})`)
  }
}

/** Remove Medusa default Europe market — Es Çay ships to Türkiye only. */
async function cleanupNonTurkeyMarket(
  container: ExecArgs["container"],
  query: any,
  logger: any,
  turkeyRegionId: string
) {
  const { data: allRegions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
  })
  for (const r of allRegions as { id: string; name?: string }[]) {
    if (r.id === turkeyRegionId || r.name === "Türkiye") continue
    logger.info(`Removing non-TR region: ${r.name} (${r.id})`)
    try {
      await deleteRegionsWorkflow(container).run({ input: { ids: [r.id] } })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`Could not delete region ${r.name}: ${msg}`)
    }
  }

  const { data: taxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
  })
  const nonTr = (taxRegions as { id: string; country_code?: string }[]).filter(
    (t) => t.country_code && t.country_code !== "tr"
  )
  if (nonTr.length) {
    logger.info(
      `Removing non-TR tax regions: ${nonTr.map((t) => t.country_code).join(", ")}`
    )
    try {
      await deleteTaxRegionsWorkflow(container).run({
        input: { ids: nonTr.map((t) => t.id) },
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`Tax region cleanup failed: ${msg}`)
    }
  }

  const { data: shippingOptions } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "service_zone.name",
      "service_zone.geo_zones.country_code",
    ],
  })
  const nonTrOptions = (shippingOptions as any[]).filter((o) => {
    const zone = o.service_zone
    if (!zone) return false
    if (zone.name === "Türkiye") return false
    const hasTr = zone.geo_zones?.some(
      (gz: { country_code?: string }) => gz.country_code === "tr"
    )
    return !hasTr
  })
  if (nonTrOptions.length) {
    const ids = nonTrOptions.map((o) => o.id as string)
    logger.info(
      `Removing ${ids.length} non-TR shipping option(s): ${nonTrOptions
        .map((o) => o.name)
        .join(", ")}`
    )
    try {
      await deleteShippingOptionsWorkflow(container).run({ input: { ids } })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn(`Shipping option cleanup failed: ${msg}`)
    }
  }
}

export default async function seedEscay({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)
  const storeModuleService = container.resolve(Modules.STORE)

  const [store] = await storeModuleService.listStores({})
  if (!store) throw new Error("No store found. Run migrations first.")

  logger.info("Store → Es Çay / TRY (Türkiye only)...")
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: "Es Çay",
        supported_currencies: [{ currency_code: "try", is_default: true }],
      },
    },
  })

  // --- Region / tax ---
  const { data: existingRegions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: { name: "Türkiye" },
  })
  let turkeyRegionId = existingRegions[0]?.id as string | undefined

  if (!turkeyRegionId) {
    const { result: regions } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Türkiye",
            currency_code: "try",
            countries: ["tr"],
            payment_providers: ["pp_system_default", "pp_paytr_paytr", "pp_havale_havale"],
          },
        ],
      },
    })
    turkeyRegionId = regions[0].id
    logger.info(`Created Türkiye region: ${turkeyRegionId}`)
  } else {
    logger.info(`Using existing Türkiye region: ${turkeyRegionId}`)
  }

  const { data: existingTaxRegions } = await query.graph({
    entity: "tax_region",
    fields: ["id"],
    filters: { country_code: "tr" },
  })
  let taxRegionId = existingTaxRegions[0]?.id as string | undefined
  if (!taxRegionId) {
    const { result: taxRegions } = await createTaxRegionsWorkflow(container).run(
      {
        input: [{ country_code: "tr", provider_id: "tp_system" }],
      }
    )
    taxRegionId = taxRegions[0].id
  }

  const { data: existingTaxRates } = await query.graph({
    entity: "tax_rate",
    fields: ["id"],
    filters: { tax_region_id: taxRegionId, code: "KDV" },
  })
  if (!existingTaxRates.length) {
    await createTaxRatesWorkflow(container).run({
      input: [
        {
          tax_region_id: taxRegionId!,
          name: "KDV",
          code: "KDV",
          rate: KDV_RATE,
          is_default: true,
        },
      ],
    })
  }

  await ensureTaxInclusive(container, query, logger, turkeyRegionId!)

  // --- Categories (idempotent ensure) — çay kategorileri (TODO(K6): katalogla netleştir) ---
  for (const c of [
    { name: "Siyah Çay", handle: "siyah-cay" },
    { name: "Yeşil Çay", handle: "yesil-cay" },
    { name: "Bitki Çayı", handle: "bitki-cayi" },
    { name: "Harmanlar", handle: "harmanlar" },
    { name: "Hediye", handle: "hediye" },
  ]) {
    await ensureCategory(container, query, logger, c)
  }

  // --- Collections (ana sayfa / kampanya grupları) ---
  const collectionDefs = [
    { title: "Yeni", handle: "yeni" },
    { title: "Çok Satanlar", handle: "cok-satanlar" },
  ]
  const { data: existingCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
    filters: { handle: collectionDefs.map((c) => c.handle) },
  })
  const collectionByHandle = new Map(existingCollections.map((c: any) => [c.handle as string, c.id as string]))
  const missingCollections = collectionDefs.filter((c) => !collectionByHandle.has(c.handle))
  if (missingCollections.length) {
    const { result: created } = await createCollectionsWorkflow(container).run({
      input: { collections: missingCollections },
    })
    for (const c of created) collectionByHandle.set(c.handle, c.id)
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfileId = shippingProfiles[0]?.id as string
  if (!shippingProfileId) throw new Error("No shipping profile")

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id"],
  })
  const stockLocationId = stockLocations[0]?.id as string
  if (!stockLocationId) throw new Error("No stock location")

  await ensureProviderOnLocation(container, query, logger, stockLocationId)

  await ensureTrShipping(
    container,
    query,
    logger,
    fulfillmentModuleService,
    shippingProfileId,
    stockLocationId,
    turkeyRegionId!
  )

  await ensureReturnReasons(container, query, logger)

  await ensurePromotions(container, query, logger)

  await cleanupNonTurkeyMarket(container, query, logger, turkeyRegionId!)

  logger.info("--- Türkiye kurulum özeti ---")
  logger.info(`Region: Türkiye (${turkeyRegionId}) — TRY, KDV %${KDV_RATE} dahil fiyatlar`)
  logger.info(`Kargo: ${SHIPPING_CONFIG.name} ${SHIPPING_CONFIG.amount} TRY · provider ${SHIPPING_PROVIDER_ID} (SHIPPING_CARRIER=${configuredCarrierCode() ?? "manual"})`)
  if (SHIPPING_CONFIG.freeOver > 0) logger.info(`Ücretsiz kargo eşiği: ${SHIPPING_CONFIG.freeOver} TRY`)
  logger.info(`İade sebepleri: ${RETURN_REASONS.map((r) => r.value).join(", ")}`)
  logger.info(`Kupon: ${WELCOME_PROMO.code} (%${WELCOME_PROMO.application_method.value} ürün)`)
  logger.info("Storefront env (Dokploy):")
  logger.info(`  NEXT_PUBLIC_MEDUSA_REGION_ID=${turkeyRegionId}`)
  logger.info("Sonraki adım: npm run ensure:publishable-key")
  logger.info("Katalog: Admin → Products (veya CSV import)")
}
