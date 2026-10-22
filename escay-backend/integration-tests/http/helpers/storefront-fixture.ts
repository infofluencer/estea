/**
 * Shared storefront fixtures for Medusa integration HTTP tests.
 * Adapted from Medusa's official helpers + Es Çay Türkiye/PayTR setup.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
  PUBLISHABLE_KEY_HEADER,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

export const PAYTR_PROVIDER_ID = "pp_paytr_paytr"
export const MANUAL_FULFILLMENT_ID = "manual_manual"

export type StoreHeaders = { headers: Record<string, string> }

export type StorefrontFixture = {
  publishableKey: string
  storeHeaders: StoreHeaders
  regionId: string
  salesChannelId: string
  stockLocationId: string
  shippingOptionId: string
  shippingProfileId: string
}

export async function seedStorefrontFixture(
  container: MedusaContainer
): Promise<StorefrontFixture> {
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillment = container.resolve(Modules.FULFILLMENT)

  const {
    result: [salesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        { name: "Es Çay Test Channel", description: "integration" },
      ],
    },
  })

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Integration Publishable Key",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  })

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: publishableApiKey.id, add: [salesChannel.id] },
  })

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: "Es Çay Test Store",
          supported_currencies: [
            { currency_code: "try", is_default: true },
          ],
          default_sales_channel_id: salesChannel.id,
        },
      ],
    },
  })

  const { result: regions } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Türkiye",
          currency_code: "try",
          countries: ["tr"],
          payment_providers: [PAYTR_PROVIDER_ID],
        },
      ],
    },
  })
  const region = regions[0]

  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: "tr", provider_id: "tp_system" }],
  })

  const { result: locations } = await createStockLocationsWorkflow(container).run({
    input: {
      locations: [
        {
          name: "Test Warehouse",
          address: {
            city: "İstanbul",
            country_code: "TR",
            address_1: "Test Cad. 1",
          },
        },
      ],
    },
  })
  const stockLocation = locations[0]

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: MANUAL_FULFILLMENT_ID },
  })

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [salesChannel.id],
    },
  })

  let shippingProfileId: string
  const { data: existingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  if (existingProfiles?.[0]?.id) {
    shippingProfileId = existingProfiles[0].id as string
  } else {
    const { result: profiles } = await createShippingProfilesWorkflow(
      container
    ).run({
      input: {
        data: [
          {
            name: "Default",
            type: "default",
          },
        ],
      },
    })
    shippingProfileId = profiles[0].id
  }

  const fulfillmentSet = await fulfillment.createFulfillmentSets({
    name: "TR Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Türkiye",
        geo_zones: [{ type: "country", country_code: "tr" }],
      },
    ],
  })

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  })

  const serviceZoneId = fulfillmentSet.service_zones[0].id

  const { result: shippingOptions } = await createShippingOptionsWorkflow(
    container
  ).run({
    input: [
      {
        name: "Standart Kargo",
        price_type: "flat",
        provider_id: MANUAL_FULFILLMENT_ID,
        service_zone_id: serviceZoneId,
        shipping_profile_id: shippingProfileId,
        type: {
          label: "Standard",
          description: "TR standard",
          code: "standard",
        },
        prices: [
          { currency_code: "try", amount: 99.99 },
          { region_id: region.id, amount: 99.99 },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  })

  return {
    publishableKey: publishableApiKey.token as string,
    storeHeaders: {
      headers: { [PUBLISHABLE_KEY_HEADER]: publishableApiKey.token as string },
    },
    regionId: region.id,
    salesChannelId: salesChannel.id,
    stockLocationId: stockLocation.id,
    shippingOptionId: shippingOptions[0].id,
    shippingProfileId,
  }
}

export async function createTestCategory(
  container: MedusaContainer,
  name = "Test Kategori",
  handle = `test-kat-${Date.now()}`
) {
  const { result } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: [
        {
          name,
          handle,
          is_active: true,
        },
      ],
    },
  })
  return result[0]
}

export async function createPricedProducts(
  container: MedusaContainer,
  fixture: StorefrontFixture,
  count: number,
  opts?: { categoryId?: string; titlePrefix?: string; unitPrice?: number }
) {
  const unitPrice = opts?.unitPrice ?? 1299
  const prefix = opts?.titlePrefix ?? "Integration Product"
  const productsInput = Array.from({ length: count }, (_, i) => ({
    title: `${prefix} ${i + 1}`,
    handle: `integration-product-${Date.now()}-${i}`,
    status: ProductStatus.PUBLISHED,
    options: [{ title: "Default", values: ["One"] }],
    variants: [
      {
        title: "Default",
        sku: `SKU-${Date.now()}-${i}`,
        options: { Default: "One" },
        prices: [{ currency_code: "try", amount: unitPrice }],
        manage_inventory: true,
      },
    ],
    shipping_profile_id: fixture.shippingProfileId,
    sales_channels: [{ id: fixture.salesChannelId }],
    ...(opts?.categoryId
      ? { categories: [{ id: opts.categoryId }] }
      : {}),
  }))

  const { result: products } = await createProductsWorkflow(container).run({
    input: { products: productsInput },
  })

  const inventoryItems: { inventory_item_id: string; location_id: string; stocked_quantity: number }[] = []
  for (const product of products) {
    for (const variant of product.variants || []) {
      const inventoryItemId = (variant as { inventory_items?: { inventory_item_id: string }[] })
        .inventory_items?.[0]?.inventory_item_id
      // createProductsWorkflow may not return inventory links — resolve via query
      void inventoryItemId
    }
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  for (const product of products) {
    for (const variant of product.variants || []) {
      const { data: links } = await query.graph({
        entity: "product_variant_inventory_item",
        fields: ["inventory_item_id", "variant_id"],
        filters: { variant_id: variant.id },
      })
      const invId = (links?.[0] as { inventory_item_id?: string } | undefined)
        ?.inventory_item_id
      if (invId) {
        inventoryItems.push({
          inventory_item_id: invId,
          location_id: fixture.stockLocationId,
          stocked_quantity: 100,
        })
      }
    }
  }

  if (inventoryItems.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: { inventory_levels: inventoryItems },
    })
  }

  return products
}

export function trShippingAddress(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "Integration",
    last_name: "Test",
    address_1: "Test Cad. No:1",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34000",
    phone: "05551112233",
    province: "İstanbul",
    metadata: { district: "Şişli" },
    ...overrides,
  }
}
