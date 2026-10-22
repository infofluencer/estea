/** Minimal colored assert helper for standalone tsx suites. */

let passed = 0
let failed = 0
const failures: string[] = []

const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`

export function resetAssertCounters() {
  passed = 0
  failed = 0
  failures.length = 0
}

export function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ${green("✓")} ${label}`)
    passed++
  } else {
    const msg = detail ? `${label} — ${detail}` : label
    console.log(`  ${red("✗")} ${msg}`)
    failed++
    failures.push(msg)
  }
}

export function assertEqual(
  label: string,
  actual: unknown,
  expected: unknown
) {
  const ok =
    actual === expected ||
    (typeof actual === "object" &&
      typeof expected === "object" &&
      JSON.stringify(actual) === JSON.stringify(expected))
  assert(
    label,
    ok,
    ok
      ? undefined
      : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
  )
}

export function assertStatus(
  label: string,
  status: number,
  expected: number | number[]
) {
  const ok = Array.isArray(expected)
    ? expected.includes(status)
    : status === expected
  assert(
    label,
    ok,
    ok ? undefined : `status ${status}, expected ${JSON.stringify(expected)}`
  )
}

export function section(title: string) {
  console.log(`\n${dim("──")} ${title}`)
}

export function summarize(suiteName: string): number {
  console.log(
    `\n${suiteName}: ${green(`${passed} passed`)}, ${
      failed ? red(`${failed} failed`) : dim("0 failed")
    }`
  )
  if (failures.length) {
    console.log(red("Failures:"))
    for (const f of failures) console.log(`  - ${f}`)
  }
  return failed
}

export function getCounts() {
  return { passed, failed }
}
