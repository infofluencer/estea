#!/usr/bin/env node
/**
 * Wrapper: require STAGING_FRONTEND_URL before Playwright boots.
 */
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const url = process.env.STAGING_FRONTEND_URL?.trim()
if (!url) {
  console.error(
    "STAGING_FRONTEND_URL gerekli (örn. http://STAGING_IP:3016).\n" +
      "Prod (:3025 / canlı domain) yasak.\n\n" +
      "Örnek:\n" +
      "  STAGING_FRONTEND_URL=http://HOST:3016 \\\n" +
      "  STAGING_BACKEND_URL=http://HOST:9000 \\\n" +
      "  STAGING_PUBLISHABLE_KEY=pk_... \\\n" +
      "  npm run test:e2e"
  )
  process.exit(1)
}

const require = createRequire(import.meta.url)
const playwrightCli = require.resolve("@playwright/test/cli")
const config = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "playwright.config.ts"
)

const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", "-c", config, ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env }
)
process.exit(result.status ?? 1)
