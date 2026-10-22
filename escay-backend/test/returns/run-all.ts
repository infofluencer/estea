#!/usr/bin/env npx tsx
/**
 * Returns test runner — runs offline suites always; live suites when fixture set.
 *
 *   npm run test:returns
 *   PAYTR_MOCK=1 npm run test:returns
 *
 * Exit 1 if any suite fails. Live suites exit 0 with SKIP when fixture missing.
 */
import { spawnSync } from "child_process"
import { join } from "path"

const root = join(__dirname)

type Suite = {
  file: string
  label: string
  /** Needs TEST_ORDER_* + publishable key */
  live?: boolean
  env?: Record<string, string>
}

const suites: Suite[] = [
  {
    file: "paytr-refund.mock.ts",
    label: "PayTR refund mock",
    env: { PAYTR_MOCK: "1" },
  },
  { file: "refund-amount.ts", label: "Refund amount / shipping" },
  { file: "notifications.ts", label: "Notifications (templates)" },
  { file: "guest-security.ts", label: "Guest return security", live: true },
  { file: "rate-limit.ts", label: "Rate-limit buckets", live: true },
  { file: "lifecycle.ts", label: "Return lifecycle", live: true },
]

function hasLiveFixture(): boolean {
  return Boolean(
    process.env.TEST_ORDER_ID &&
      process.env.TEST_ORDER_EMAIL &&
      process.env.TEST_ORDER_ITEM_ID &&
      process.env.TEST_REASON_ID &&
      (process.env.MEDUSA_PUBLISHABLE_KEY ||
        process.env.TEST_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)
  )
}

function main() {
  console.log("\n╔══════════════════════════════════════════╗")
  console.log("║  Es Çay Returns — A→Z test package       ║")
  console.log("╚══════════════════════════════════════════╝")

  const live = hasLiveFixture()
  if (!live) {
    console.log(
      "\nLive fixture yok → guest-security / rate-limit / lifecycle SKIP.\n" +
        "Set TEST_ORDER_ID, TEST_ORDER_EMAIL, TEST_ORDER_ITEM_ID, TEST_REASON_ID,\n" +
        "MEDUSA_PUBLISHABLE_KEY (+ running backend) for full suite.\n"
    )
  }

  let passedSuites = 0
  let failedSuites = 0
  let skippedSuites = 0
  const failedLabels: string[] = []

  for (const suite of suites) {
    if (suite.live && !live) {
      console.log(`\n⏭  SKIP ${suite.label} (${suite.file})`)
      skippedSuites++
      continue
    }

    console.log(`\n▶  ${suite.label} (${suite.file})`)
    const result = spawnSync(
      "npx",
      ["tsx", join(root, suite.file)],
      {
        stdio: "inherit",
        env: { ...process.env, ...(suite.env || {}), PAYTR_MOCK: "1" },
        cwd: join(root, "../.."),
      }
    )

    if (result.status === 0) {
      passedSuites++
    } else {
      failedSuites++
      failedLabels.push(suite.label)
    }
  }

  console.log("\n──────────────────────────────────────────")
  console.log(
    `Summary: ${passedSuites} passed / ${failedSuites} failed / ${skippedSuites} skipped`
  )
  if (failedLabels.length) {
    console.log("Failed suites:")
    for (const l of failedLabels) console.log(`  - ${l}`)
  }
  console.log("──────────────────────────────────────────\n")

  process.exit(failedSuites > 0 ? 1 : 0)
}

main()
