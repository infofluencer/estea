/** Colored PASS/FAIL helpers for staging smoke suites. */

let passed = 0
let failed = 0
const failures: { name: string; detail: string }[] = []
const results: { name: string; pass: boolean; detail: string }[] = []

const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim = (s: string) => `\x1b[90m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`

export function resetAssertCounters() {
  passed = 0
  failed = 0
  failures.length = 0
  results.length = 0
}

export function assert(name: string, condition: boolean, detail?: string) {
  const d = detail || ""
  if (condition) {
    console.log(`  ${green("PASS")} ${name}${d ? dim(` — ${d}`) : ""}`)
    passed++
    results.push({ name, pass: true, detail: d })
  } else {
    console.log(`  ${red("FAIL")} ${name}${d ? ` — ${d}` : ""}`)
    failed++
    failures.push({ name, detail: d })
    results.push({ name, pass: false, detail: d })
  }
}

export function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok =
    actual === expected ||
    (typeof actual === "object" &&
      typeof expected === "object" &&
      JSON.stringify(actual) === JSON.stringify(expected))
  assert(
    name,
    ok,
    ok
      ? undefined
      : `beklenen=${JSON.stringify(expected)} alınan=${JSON.stringify(actual)}`
  )
}

export function assertStatus(
  name: string,
  status: number,
  expected: number | number[]
) {
  const ok = Array.isArray(expected)
    ? expected.includes(status)
    : status === expected
  assert(
    name,
    ok,
    ok
      ? `status=${status}`
      : `status=${status}, beklenen=${JSON.stringify(expected)}`
  )
}

export function section(title: string) {
  console.log(`\n${dim("──")} ${title}`)
}

export function skip(name: string, reason: string) {
  console.log(`  ${yellow("SKIP")} ${name} — ${reason}`)
  results.push({ name, pass: true, detail: `SKIP: ${reason}` })
}

export function getCounts() {
  return { passed, failed }
}

export function getResults() {
  return [...results]
}

export function getFailures() {
  return [...failures]
}

export function printTable() {
  console.log("")
  console.log("════════════════════════════════════════")
  console.log(" STAGING SMOKE — PASS / FAIL")
  console.log("════════════════════════════════════════")
  for (const r of results) {
    const tag = !r.pass
      ? red("FAIL")
      : r.detail.startsWith("SKIP:")
        ? yellow("SKIP")
        : green("PASS")
    console.log(` ${tag}  ${r.name}`)
    if (!r.pass && r.detail) {
      console.log(`       ${dim(r.detail)}`)
    }
  }
  console.log("────────────────────────────────────────")
  console.log(
    ` ${green(`${passed} passed`)}  ${
      failed ? red(`${failed} failed`) : dim("0 failed")
    }`
  )
  console.log("════════════════════════════════════════\n")
}
