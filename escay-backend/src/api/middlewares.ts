import {
  authenticate,
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import {
  authLoginRateLimit,
  authPasswordResetRequestRateLimit,
  authPasswordUpdateRateLimit,
  authRegisterRateLimit,
} from "./auth/rate-limit"
import { verificationRequestRateLimit } from "./auth/verification/rate-limit"
import { adminRememberMe } from "./auth/remember-me"
import { contactRateLimit } from "./store/contact/rate-limit"
import {
  stripReservedCartMetadata,
  stripReservedLineItemMetadata,
} from "./store/_strip-reserved-metadata"
import { lookupRateLimit } from "./store/orders/lookup/rate-limit"
import { exchangeOptionsRateLimit } from "./store/returns/exchange-options/rate-limit"
import {
  customerReturnRateLimit,
  guestReturnRateLimit,
} from "./store/returns/guest/rate-limit"
import { paytrCallbackRateLimit } from "./paytr/callback/rate-limit"
import { ensureReturnReceiveLocation } from "./admin/returns/ensure-location"
import { markPendingBankTransfersInList } from "./admin/orders/bank-transfer-list-status"
import { filterOrdersByStatus } from "./admin/orders/status-filter"

const StoreOrderLookup = z
  .object({
    id: z.string().min(1),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().email()
    ),
  })
  .strict()

const StoreChangePassword = z
  .object({
    current_password: z.string().min(1),
    new_password: z.string().min(8),
  })
  .strict()

const StoreWishlistItem = z
  .object({
    product_id: z.string().min(1),
    handle: z.string().min(1),
    title: z.string().min(1),
    thumbnail: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
  })
  .strict()

const StoreWishlistSync = z
  .object({
    items: z.array(StoreWishlistItem).max(100),
  })
  .strict()

const StoreContact = z
  .object({
    name: z.string().min(2).max(120),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().email()
    ),
    subject: z.string().min(2).max(160),
    message: z.string().min(10).max(5000),
    company: z.string().max(200).optional(),
  })
  .strict()

const StoreReturnItem = z.object({
  id: z.string().min(1),
  quantity: z.number().int().min(1),
  /** Değişim: yeni varyant (aynı ürün) */
  exchange_variant_id: z.string().min(1).max(100).nullish(),
})

const StoreCustomerReturn = z
  .object({
    order_id: z.string().min(1),
    items: z.array(StoreReturnItem).min(1),
    reason_id: z.string().min(1),
    note: z.string().max(500).nullish(),
  })
  .strict()

const StoreGuestReturn = z
  .object({
    order_id: z.string().min(1),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().email()
    ),
    items: z.array(StoreReturnItem).min(1),
    reason_id: z.string().min(1),
    note: z.string().max(500).nullish(),
  })
  .strict()

export default defineMiddlewares({
  routes: [
    // PayTR callback: AUTH yok, publishable-key yok — PayTR sunucusu erişmeli
    {
      matcher: "/paytr/callback",
      methods: ["POST"],
      middlewares: [paytrCallbackRateLimit],
    },
    // Kargo firması durum webhook'u: AUTH yok — firma sunucusu erişmeli.
    // Doğrulama adaptörün parseWebhook'unda (CARRIER_WEBHOOK_SECRET / imza).
    {
      matcher: "/carrier/webhook",
      methods: ["POST"],
      middlewares: [],
    },
    // Deploy doğrulama — AUTH yok (CACHE_BUST / git commit kontrolü)
    {
      matcher: "/health/revision",
      methods: ["GET"],
      middlewares: [],
    },
    // Admin girişi: "Beni hatırla" → oturum cookie'si 7 gün
    {
      matcher: "/auth/session",
      methods: ["POST"],
      middlewares: [adminRememberMe],
    },
    {
      matcher: "/auth/verification/request",
      methods: ["POST"],
      middlewares: [verificationRequestRateLimit],
    },
    // Customer auth — brute-force / reset-mail spam (in-memory; TODO Redis)
    {
      matcher: "/auth/customer/emailpass/register",
      methods: ["POST"],
      middlewares: [authRegisterRateLimit],
    },
    {
      matcher: "/auth/customer/emailpass/reset-password",
      methods: ["POST"],
      middlewares: [authPasswordResetRequestRateLimit],
    },
    {
      matcher: "/auth/customer/emailpass/update",
      methods: ["POST"],
      middlewares: [authPasswordUpdateRateLimit],
    },
    {
      matcher: "/auth/customer/emailpass",
      methods: ["POST"],
      middlewares: [authLoginRateLimit],
    },
    {
      matcher: "/store/orders/:id",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/orders/lookup",
      methods: ["POST"],
      middlewares: [
        lookupRateLimit,
        validateAndTransformBody(StoreOrderLookup),
      ],
    },
    {
      matcher: "/store/returns/guest",
      methods: ["POST"],
      middlewares: [
        guestReturnRateLimit,
        validateAndTransformBody(StoreGuestReturn),
      ],
    },
    {
      matcher: "/store/returns/exchange-options",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true }),
        exchangeOptionsRateLimit,
      ],
    },
    {
      matcher: "/store/returns/request",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        customerReturnRateLimit,
        validateAndTransformBody(StoreCustomerReturn),
      ],
    },
    {
      // Ödenmemiş havale → liste "Ödeme" sütununda "Havale onayı bekleniyor";
      // "Filtre Ekle" ödeme / kargo durumu → id filtresi (status-filter.ts)
      matcher: "/admin/orders",
      methods: ["GET"],
      middlewares: [filterOrdersByStatus, markPendingBankTransfersInList],
    },
    {
      matcher: "/admin/returns/:id/receive",
      methods: ["POST"],
      middlewares: [ensureReturnReceiveLocation],
    },
    {
      matcher: "/admin/returns/:id/receive/confirm",
      methods: ["POST"],
      middlewares: [ensureReturnReceiveLocation],
    },
    {
      matcher: "/admin/returns/:id/accept",
      methods: ["POST"],
      middlewares: [ensureReturnReceiveLocation],
    },
    // İstemci metadata'sından sunucu kontrol anahtarlarını sil (bkz. _strip-reserved-metadata)
    {
      matcher: "/store/carts",
      methods: ["POST"],
      middlewares: [stripReservedCartMetadata],
    },
    {
      matcher: "/store/carts/:id",
      methods: ["POST"],
      middlewares: [stripReservedCartMetadata],
    },
    {
      matcher: "/store/carts/:id/line-items",
      methods: ["POST"],
      middlewares: [stripReservedLineItemMetadata],
    },
    {
      matcher: "/store/carts/:id/line-items/:line_id",
      methods: ["POST"],
      middlewares: [stripReservedLineItemMetadata],
    },
    {
      matcher: "/store/contact",
      methods: ["POST"],
      middlewares: [
        contactRateLimit,
        validateAndTransformBody(StoreContact),
      ],
    },
    {
      matcher: "/store/customers/me/password",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(StoreChangePassword),
      ],
    },
    {
      matcher: "/store/customers/me/wishlist",
      methods: ["GET"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/customers/me/wishlist",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(StoreWishlistItem),
      ],
    },
    {
      matcher: "/store/customers/me/wishlist/sync",
      methods: ["POST"],
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(StoreWishlistSync),
      ],
    },
    {
      matcher: "/store/customers/me/wishlist/:product_id",
      methods: ["DELETE"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
})
