import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { syncBizimhesapStock } from "../../src/lib/bizimhesap-stock-sync"
import { fulfillOrderItems } from "./helpers/fulfill-order"
import { placeGuestStubOrder } from "./helpers/place-order"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(120 * 1000)

const WAREHOUSE = "depo-1"
const realFetch = globalThis.fetch

// medusa-config modül seçeneklerini runner'ın `env`'inden önce okuyor.
process.env.BIZIMHESAP_TOKEN = "test-token"
process.env.BIZIMHESAP_WAREHOUSE_ID = WAREHOUSE
process.env.BIZIMHESAP_STOCK_APPLY = "true"

/** Yalnız BizimHesap uçları sahtelenir; `inventory` eşlenen stok listesidir. */
function stubBizimhesap(stock: Record<string, number>) {
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const target = String(url)
    if (!target.includes("bizimhesap.com/api/b2b/")) {
      return realFetch(url as never, init as never)
    }
    if (!target.endsWith(`/inventory/${WAREHOUSE}`) && !target.endsWith("/products")) {
      throw new Error(`Beklenmeyen istek: ${target}`)
    }
    const rows = Object.entries(stock).map(([code, quantity]) => ({ id: code, code, quantity }))
    return new Response(JSON.stringify({ resultCode: 1, data: { rows } }), { status: 200 })
  }) as typeof fetch
}

async function readLevel(container: MedusaContainer, variantId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: [
      "inventory_items.inventory.location_levels.stocked_quantity",
      "inventory_items.inventory.location_levels.reserved_quantity",
    ],
    filters: { id: variantId },
  })
  const variant = data[0] as unknown as {
    inventory_items: {
      inventory: { location_levels: { stocked_quantity: number; reserved_quantity: number }[] }
    }[]
  }
  return variant.inventory_items[0].inventory.location_levels[0]
}

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    PAYTR_MOCK: "1",
    PAYTR_MERCHANT_ID: "",
    PAYTR_MERCHANT_KEY: "",
    PAYTR_MERCHANT_SALT: "",
    SHIPPING_CARRIER: "",
    COOKIE_SECURE: "false",
    BIZIMHESAP_FIRM_ID: "",
  },
  testSuite: ({ api, getContainer }) => {
    describe("BizimHesap stok eşitlemesi (gerçek Medusa stoğu, sahte API)", () => {
      let fx: StorefrontFixture
      let synced: { id: string; sku: string }
      let absent: { id: string; sku: string }

      beforeAll(async () => {
        const container = getContainer()
        fx = await seedStorefrontFixture(container)
        const products = await createPricedProducts(container, fx, 2, { titlePrefix: "Stok" })
        const [a, b] = products.map((p) => p.variants[0])
        synced = { id: a.id, sku: a.sku as string }
        absent = { id: b.id, sku: b.sku as string }
      })

      afterEach(() => {
        globalThis.fetch = realFetch
      })

      it("eşleşen stoğu yazar, BizimHesap'ta olmayana dokunmaz", async () => {
        const container = getContainer()
        stubBizimhesap({ [synced.sku]: 7 })

        const result = await syncBizimhesapStock(container)

        expect(result.status).toBe("applied")
        expect((await readLevel(container, synced.id)).stocked_quantity).toBe(7)
        expect((await readLevel(container, absent.id)).stocked_quantity).toBe(100)
      })

      it("apply kapalıyken yazmaz", async () => {
        const container = getContainer()
        stubBizimhesap({ [synced.sku]: 7 })

        const result = await syncBizimhesapStock(container, { apply: false })

        expect(result.status).toBe("dry_run")
        expect((await readLevel(container, synced.id)).stocked_quantity).toBe(100)
      })

      it("hatalı yanıtta stoğa dokunmaz", async () => {
        const container = getContainer()
        stubBizimhesap({})

        await expect(syncBizimhesapStock(container)).rejects.toThrow("boş stok listesi")
        expect((await readLevel(container, synced.id)).stocked_quantity).toBe(100)
      })

      it("rezervasyon, kargo ve fatura boyunca fazla satışa izin vermez", async () => {
        const container = getContainer()
        stubBizimhesap({ [synced.sku]: 10 })
        await syncBizimhesapStock(container)

        const order = await placeGuestStubOrder(api, fx, synced.id, "stok@example.com", {
          quantity: 2,
        })

        // Sipariş açık: fiziksel stok aynı, 2 adet ayrılmış.
        await syncBizimhesapStock(container)
        expect(await readLevel(container, synced.id)).toMatchObject({
          stocked_quantity: 10,
          reserved_quantity: 2,
        })

        // Kargolandı, fatura teslimde: BizimHesap hâlâ 10 diyor, geri 10 yazılmamalı.
        await fulfillOrderItems(container, {
          orderId: order.id,
          itemId: order.items[0].id,
          quantity: 2,
          locationId: fx.stockLocationId,
        })
        await syncBizimhesapStock(container)
        expect(await readLevel(container, synced.id)).toMatchObject({
          stocked_quantity: 8,
          reserved_quantity: 0,
        })

        // Fatura kesildi, BizimHesap 8'e indi: çift düşüm olmamalı.
        await container.resolve(Modules.ORDER).updateOrders([
          {
            id: order.id,
            metadata: {
              bizimhesap_invoice: {
                status: "created",
                mode: "live",
                items: [{ line_item_id: order.items[0].id, quantity: 2 }],
              },
            },
          },
        ])
        stubBizimhesap({ [synced.sku]: 8 })
        await syncBizimhesapStock(container)
        expect((await readLevel(container, synced.id)).stocked_quantity).toBe(8)
      })
    })
  },
})
