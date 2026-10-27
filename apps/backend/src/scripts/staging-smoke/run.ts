#!/usr/bin/env npx tsx
/**
 * Staging uçtan uca backend smoke — staging API'ye karşı HTTP testleri.
 *
 *   STAGING_BACKEND_URL=http://HOST:PORT \
 *   STAGING_PUBLISHABLE_KEY=pk_... \
 *   STAGING_FRONTEND_URL=http://HOST:3016 \
 *   npm run test:staging:backend
 *
 * Opsiyonel:
 *   STAGING_REGION_ID, STAGING_EXPECTED_PRODUCT_COUNT=45
 *   STAGING_ADMIN_EMAIL / STAGING_ADMIN_PASSWORD
 *   STAGING_VERIFIED_EMAIL / STAGING_VERIFIED_PASSWORD
 *   STAGING_REDIS_URL, STAGING_PRODUCT_HANDLE
 *
 * PROD URL'lerine (market.esteacay.com, :3015) istek ATILMAZ.
 */

import {
  getCounts,
  getFailures,
  printTable,
  resetAssertCounters,
} from "./_helpers/assert"
import { loadStagingEnv } from "./_helpers/env"
import { runAuthSuite } from "./suites/auth"
import { runCartSuite } from "./suites/cart"
import { runCatalogSuite } from "./suites/catalog"
import { runCheckoutSuite } from "./suites/checkout"
import { runConfigSuite } from "./suites/config"
import { runHealthSuite } from "./suites/health"
import { runOrderTrackingSuite } from "./suites/order-tracking"
import { runOrderSuite } from "./suites/orders"

async function main() {
  resetAssertCounters()

  console.log("\n╔══════════════════════════════════════════════════╗")
  console.log("║  Es Çay Staging Smoke — Backend API              ║")
  console.log("╚══════════════════════════════════════════════════╝")

  let env
  try {
    env = loadStagingEnv()
  } catch (e) {
    console.error("\nConfig error:", e instanceof Error ? e.message : e)
    process.exit(1)
  }

  console.log(`\nBackend:  ${env.backendUrl}`)
  console.log(`Frontend: ${env.frontendUrl || "(unset)"}`)
  console.log(`Products expected ≈ ${env.expectedProductCount}`)

  try {
    await runHealthSuite(env)
    const catalog = await runCatalogSuite(env)
    if (!catalog) {
      printTable()
      process.exit(1)
    }

    const cart = await runCartSuite(env, catalog)
    if (!cart) {
      printTable()
      process.exit(1)
    }

    const checkout = await runCheckoutSuite(env, cart)
    if (!checkout) {
      printTable()
      process.exit(1)
    }

    await runOrderSuite(env, checkout)
    await runOrderTrackingSuite(env, checkout)
    await runAuthSuite(env)
    await runConfigSuite(env)
  } catch (e) {
    console.error(
      "\nUnhandled error:",
      e instanceof Error ? e.stack || e.message : e
    )
    printTable()
    process.exit(1)
  }

  printTable()
  const { failed } = getCounts()
  if (failed > 0) {
    console.log("Detay:")
    for (const f of getFailures()) {
      console.log(`  - ${f.name}: ${f.detail}`)
    }
  }

  process.exit(failed > 0 ? 1 : 0)
}

main()
