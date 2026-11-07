import fs from "node:fs"
import path from "node:path"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createPricedProducts,
  seedStorefrontFixture,
  type StorefrontFixture,
} from "./helpers/storefront-fixture"
import { placeGuestStubOrder } from "./helpers/place-order"
import {
  createAdminHeaders,
  noThrow,
  registerVerifiedCustomer,
  type VerifiedCustomer,
} from "./helpers/auth"

jest.setTimeout(180 * 1000)

/** src/api/admin altındaki özel uçlar — yeni uç eklenince buraya da eklenmeli. */
const ADMIN_ROUTES: [method: "get" | "post", path: string][] = [
  ["get", "/admin/custom"],
  ["get", "/admin/escay-exchanges"],
  ["get", "/admin/escay-labels/exchanges"],
  ["get", "/admin/escay-labels/orders"],
  ["get", "/admin/escay-nav-counts"],
  ["get", "/admin/escay-returns"],
  ["post", "/admin/escay-shipments/reconcile"],
  ["get", "/admin/ops-events"],
  ["get", "/admin/sales-stats"],
  ["get", "/admin/tr-geo"],
  ["get", "/admin/orders/order_x/bank-transfer"],
  ["post", "/admin/orders/order_x/bank-transfer/confirm"],
  ["post", "/admin/orders/order_x/bizimhesap-invoice/retry"],
  ["post", "/admin/orders/order_x/contracts"],
  ["get", "/admin/orders/order_x/contracts/distance-sales"],
  ["post", "/admin/orders/order_x/escay-status"],
  ["get", "/admin/orders/order_x/exchange"],
  ["post", "/admin/orders/order_x/exchange"],
  ["get", "/admin/orders/order_x/fulfillment"],
  ["post", "/admin/orders/order_x/fulfillment/attach"],
  ["post", "/admin/orders/order_x/fulfillment/reship"],
  ["post", "/admin/orders/order_x/fulfillment/retry"],
  ["post", "/admin/returns/ret_x/accept"],
  ["post", "/admin/returns/ret_x/exchange"],
  ["post", "/admin/returns/ret_x/exchange/cancel"],
  ["post", "/admin/returns/ret_x/exchange/reship"],
  ["post", "/admin/returns/ret_x/exchange/ship"],
  ["post", "/admin/returns/ret_x/refund"],
  ["post", "/admin/returns/ret_x/reject"],
  ["post", "/admin/returns/ret_x/return-code"],
]

const CUSTOMER_ROUTES: [method: "get" | "post" | "delete", path: string][] = [
  ["get", "/store/orders"],
  ["get", "/store/orders/order_x"],
  ["post", "/store/customers/me/password"],
  ["get", "/store/customers/me/wishlist"],
  ["post", "/store/customers/me/wishlist"],
  ["post", "/store/customers/me/wishlist/sync"],
  ["delete", "/store/customers/me/wishlist/prod_x"],
  ["post", "/store/returns/request"],
]

function call(
  api: Record<string, Function>,
  method: string,
  path: string,
  opts: Record<string, unknown>
) {
  return method === "get" || method === "delete"
    ? api[method](path, opts)
    : api[method](path, {}, opts)
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
  },
  testSuite: ({ api, getContainer }) => {
    describe("Erişim kontrolü", () => {
      let fx: StorefrontFixture
      let variantId: string

      beforeAll(async () => {
        fx = await seedStorefrontFixture(getContainer())
        const products = await createPricedProducts(getContainer(), fx, 1)
        variantId = products[0].variants![0].id
      })

      it("listede src/api/admin altındaki her uç var", () => {
        const root = path.join(__dirname, "../../src/api/admin")
        const found: string[] = []
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name === "route.ts") {
              const src = fs.readFileSync(full, "utf8")
              const rel = path.relative(root, dir).split(path.sep).join("/")
              for (const [, m] of src.matchAll(/export (?:const|async function) (GET|POST|DELETE)\b/g)) {
                found.push(`${m.toLowerCase()} /admin/${rel}`)
              }
            }
          }
        }
        walk(root)
        const listed = ADMIN_ROUTES.map(([m, p]) =>
          `${m} ${p.replace(/order_x/, "[id]").replace(/ret_x/, "[id]").replace(/distance-sales$/, "[kind]")}`
        )
        expect(found.sort()).toEqual([...listed].sort())
      })

      it.each(ADMIN_ROUTES)("admin %s %s token yoksa 401", async (method, path) => {
        const res = await call(api as never, method, path, noThrow)
        expect(res.status).toEqual(401)
      })

      it.each(ADMIN_ROUTES)("admin %s %s müşteri token'ıyla 401", async (method, path) => {
        const customer = await customerOnce()
        const res = await call(api as never, method, path, { ...customer.headers, ...noThrow })
        expect(res.status).toEqual(401)
      })

      it.each(CUSTOMER_ROUTES)("müşteri %s %s girişsiz 401", async (method, path) => {
        const res = await call(api as never, method, path, { ...fx.storeHeaders, ...noThrow })
        expect(res.status).toEqual(401)
      })

      it("admin token'ıyla liste uçları açılır", async () => {
        const admin = await createAdminHeaders(getContainer())
        for (const path of ["/admin/escay-nav-counts", "/admin/escay-returns", "/admin/ops-events"]) {
          const res = await api.get(path, { ...admin, ...noThrow })
          expect({ path, status: res.status }).toEqual({ path, status: 200 })
        }
      })

      let cached: VerifiedCustomer | null = null
      async function customerOnce() {
        cached ??= await registerVerifiedCustomer(
          api,
          getContainer(),
          fx,
          `acl-${Date.now()}@escay.test`
        )
        return cached
      }

      it("çekirdek GET /store/orders/:id kimliksiz sipariş okutmaz (PII)", async () => {
        const order = await placeGuestStubOrder(api, fx, variantId, `pii-${Date.now()}@escay.test`)
        const res = await api.get(`/store/orders/${order.id}`, { ...fx.storeHeaders, ...noThrow })
        expect(res.status).toEqual(401)
        expect(JSON.stringify(res.data)).not.toContain(order.email)
      })

      it("müşteri başkasının siparişini id ile açamaz; listesinde görmez", async () => {
        const a = await registerVerifiedCustomer(api, getContainer(), fx, `iso-a-${Date.now()}@escay.test`)
        const b = await registerVerifiedCustomer(api, getContainer(), fx, `iso-b-${Date.now()}@escay.test`)
        const orderA = await placeGuestStubOrder(api, fx, variantId, a.email, { headers: a.headers })

        const own = await api.get(`/store/orders/${orderA.id}`, a.headers)
        expect(own.status).toEqual(200)
        expect(own.data.order.id).toEqual(orderA.id)

        const foreign = await api.get(`/store/orders/${orderA.id}`, { ...b.headers, ...noThrow })
        expect(foreign.status).toEqual(404)

        const listB = await api.get(`/store/orders`, b.headers)
        expect((listB.data.orders as { id: string }[]).map((o) => o.id)).not.toContain(orderA.id)
      })

      it("sahte / bozuk Bearer token 401", async () => {
        const res = await api.get(`/store/orders`, {
          headers: { ...fx.storeHeaders.headers, Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x" },
          ...noThrow,
        })
        expect(res.status).toEqual(401)
      })
    })
  },
})
