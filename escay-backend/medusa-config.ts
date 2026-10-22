import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Docker / internal Postgres has no TLS; Medusa otherwise forces SSL for non-localhost hosts.
    databaseDriverOptions: {
      connection: {
        ssl: false,
      },
    },
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
    // Admin oturumu (express-session, Redis). Varsayılan 10 saat sabitti →
    // panel sık sık çıkış yapıyordu. rolling: her istekte süre yenilenir.
    // "Beni hatırla" işaretliyse /auth/session middleware'i 7 güne çıkarır (src/api/auth/remember-me.ts).
    sessionOptions: {
      ttl: 12 * 60 * 60 * 1000, // 12 saat
      rolling: true,
    },
    // HTTP IP admin (no TLS): COOKIE_SECURE=false. HTTPS domain: unset or true.
    cookieOptions: {
      sameSite: "lax" as const,
      secure: process.env.COOKIE_SECURE !== "false",
    },
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      authMethodsPerActor: {
        user: ["emailpass"],
        customer: ["emailpass"],
      },
      // Müşteri e-posta doğrulaması zorunlu (tam JWT doğrulama sonrası); misafir checkout etkilenmez.
      authVerificationsPerActor: {
        user: [],
        customer: [{ entity_type: "email", auth_provider: "emailpass" }],
      },
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    storefrontUrl: process.env.STOREFRONT_URL || "http://localhost:3015",
  },
  modules: [
    {
      // Auth yeniden tanımlanır: doğrulama token TTL'i 24 saat (varsayılan 15 dk).
      // emailpass açıkça listelenmeli (Medusa standart provider'ı).
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
          },
        ],
        verification: {
          providers: [
            {
              id: "token",
              options: {
                ttl_seconds: 60 * 60 * 24, // 24 hours
              },
            },
          ],
        },
      },
    },
    {
      resolve: "@medusajs/medusa/cache-redis",
      options: { redisUrl: process.env.REDIS_URL },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: process.env.REDIS_URL },
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/paytr",
            id: "paytr",
            options: {
              merchantId: process.env.PAYTR_MERCHANT_ID,
              merchantKey: process.env.PAYTR_MERCHANT_KEY,
              merchantSalt: process.env.PAYTR_MERCHANT_SALT,
              testMode: process.env.PAYTR_TEST_MODE ?? "1",
              storefrontUrl: process.env.STOREFRONT_URL ?? "http://localhost:3015",
            },
          },
          {
            // Havale / EFT — provider_id: pp_havale_havale (BANK_TRANSFER_* env'leri).
            resolve: "./src/modules/bank-transfer",
            id: "havale",
          },
        ],
      },
    },
    {
      // DİKKAT: Bu blok Medusa'nın varsayılan fulfillment tanımını KOMPLE değiştirir;
      // yerleşik "manual" sağlayıcısı AÇIKÇA tekrar tanımlanmalıdır (ders #8).
      // Kargo firması yokken (SHIPPING_CARRIER boş) seed shipping option'ı manual_manual'a bağlar.
      // Firma seçilince src/modules/carrier/adapters altına adaptör eklenir, env SHIPPING_CARRIER=<kod>
      // ve seed yeniden çalıştırılır → carrier_carrier.
      resolve: "@medusajs/medusa/fulfillment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/fulfillment-manual",
            id: "manual",
          },
          {
            // Generic kargo provider'ı (provider_id: carrier_carrier). Adaptör yoksa
            // createFulfillment yalnızca kayıt açar (carrier: manual).
            resolve: "./src/modules/carrier",
            id: "carrier",
            options: {
              packageProfile: process.env.SHIPPING_PACKAGE_DEFAULT,
              defaultDistrict: process.env.SHIPPING_DEFAULT_DISTRICT,
              fallbackShippingPrice: process.env.SHIPPING_FALLBACK_PRICE,
            },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/smtp-notification",
            id: "smtp",
            options: {
              channels: ["email"],
              host: process.env.SMTP_HOST,
              port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
              from: process.env.SMTP_FROM,
              secure: process.env.SMTP_SECURE === "true",
            },
          },
          // Admin paneli zil bildirimleri (channel "feed", template "admin-ui")
          {
            resolve: "@medusajs/medusa/notification-local",
            id: "local",
            options: { channels: ["feed"] },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/wishlist",
    },
    {
      // Ödeme / iptal / kargo olay kaydı (admin "Logs")
      resolve: "./src/modules/ops-event",
    },
    {
      // Paraşüt e-arşiv / e-fatura. Kimlik yoksa mock (gerçek HTTP yok).
      resolve: "./src/modules/parasut",
      options: {
        clientId: process.env.PARASUT_CLIENT_ID,
        clientSecret: process.env.PARASUT_CLIENT_SECRET,
        username: process.env.PARASUT_USERNAME,
        password: process.env.PARASUT_PASSWORD,
        companyId: process.env.PARASUT_COMPANY_ID,
        baseUrl: process.env.PARASUT_BASE_URL,
        env: process.env.PARASUT_ENV ?? "test",
        defaultVatRate: process.env.PARASUT_DEFAULT_VAT_RATE,
        shippingVatRate: process.env.PARASUT_SHIPPING_VAT_RATE,
        dryRun: process.env.PARASUT_DRY_RUN,
        productCreate: process.env.PARASUT_PRODUCT_CREATE,
        shippingProductId: process.env.PARASUT_SHIPPING_PRODUCT_ID,
        shippingProductCode: process.env.PARASUT_SHIPPING_PRODUCT_CODE,
      },
    },
    // File module: S3 when S3_BUCKET set, otherwise local static for dev.
    buildFileModule(),
  ],
})

function buildFileModule() {
  const useS3 = Boolean(process.env.S3_BUCKET)
  return {
    resolve: "@medusajs/medusa/file",
    options: {
      providers: [
        useS3
          ? {
              resolve: "@medusajs/medusa/file-s3",
              id: "s3",
              options: {
                file_url: process.env.S3_FILE_URL,
                access_key_id: process.env.S3_ACCESS_KEY_ID,
                secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                region: process.env.S3_REGION,
                bucket: process.env.S3_BUCKET,
                endpoint: process.env.S3_ENDPOINT,
                // Bucket policy yalnızca files/* public — admin yüklemeleri de oraya
                // (database-backups/ vb. private kalır)
                prefix: process.env.S3_PREFIX ?? "files/",
                // ACL kapalı bucket (Object Ownership: bucket owner enforced).
                acl: false,
              },
            }
          : {
              resolve: "@medusajs/medusa/file-local",
              id: "local",
              options: {
                upload_dir: "static",
                backend_url: process.env.MEDUSA_BACKEND_PUBLIC_URL
                  ? `${process.env.MEDUSA_BACKEND_PUBLIC_URL.replace(/\/$/, "")}/static`
                  : "http://localhost:9000/static",
              },
            },
      ],
    },
  }
}
