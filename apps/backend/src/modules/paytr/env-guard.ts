/**
 * PayTR env bayraklarının boot'ta doğrulanması.
 *
 * Mareen dersi: env varsayılanları tuzaktı. PAYTR_TEST_MODE tanımsızken test modu;
 * PAYTR_OID_PREFIX doluyken canlı ödeme reddediliyor ve Meta/Omnisend olayları
 * gitmiyordu. Prod'da her bayrak açıkça yazılır; tutarsızlıkta süreç başlamaz.
 *
 * Çağrı: PaytrProviderService.validateOptions (Medusa module-provider-loader boot'ta çağırır).
 * NODE_ENV=production (ya da PAYTR_ENV_STRICT=1) → hata varsa throw; aksi halde yalnız log.
 */

export type PaytrEnvReport = {
  errors: string[]
  warnings: string[]
}

const CREDENTIAL_KEYS = [
  "PAYTR_MERCHANT_ID",
  "PAYTR_MERCHANT_KEY",
  "PAYTR_MERCHANT_SALT",
] as const

const truthy = (v: string | undefined) => v === "1" || v === "true"

export function checkPaytrEnv(env: NodeJS.ProcessEnv = process.env): PaytrEnvReport {
  const errors: string[] = []
  const warnings: string[] = []

  const isProd = (env.NODE_ENV || "development").trim() === "production"
  const testModeRaw = env.PAYTR_TEST_MODE
  const testMode = (testModeRaw ?? "").trim()
  const prefix = (env.PAYTR_OID_PREFIX || "").trim()
  const mock = truthy(env.PAYTR_MOCK)
  const missingCreds = CREDENTIAL_KEYS.filter((k) => !(env[k] || "").trim())

  // 1. Test modu açıkça yazılmalı — tanımsız = sessizce test modu.
  if (testModeRaw === undefined || testMode === "") {
    const msg =
      "PAYTR_TEST_MODE tanımsız — varsayılan test modu (1), gerçek para çekilmez. Açıkça 0 veya 1 yazın."
    ;(isProd ? errors : warnings).push(msg)
  } else if (testMode !== "0" && testMode !== "1") {
    errors.push(`PAYTR_TEST_MODE=${testMode} geçersiz — 0 (canlı) veya 1 (test) olmalı.`)
  }

  const live = testMode === "0"

  // 2. Canlı mod ile çelişen bayraklar.
  if (live && prefix) {
    errors.push(
      `PAYTR_TEST_MODE=0 (canlı) iken PAYTR_OID_PREFIX=${prefix} dolu — get-token reddedilir, ` +
        "Meta/Omnisend olayları gitmez. Prod'da PAYTR_OID_PREFIX boş olmalı."
    )
  }
  if (live && mock) {
    errors.push("PAYTR_TEST_MODE=0 (canlı) iken PAYTR_MOCK açık — callback imzasız kabul edilir.")
  }
  if (live && missingCreds.length) {
    errors.push(`Canlı modda PayTR kimlikleri eksik: ${missingCreds.join(", ")}.`)
  }
  if (live && truthy(env.PAYTR_DEBUG_ON)) {
    warnings.push("Canlı modda PAYTR_DEBUG_ON açık — PayTR get-token debug_on=1 gider.")
  }

  // 3. Mock yalnızca canlı dışı ortam işaretiyle (prefix) birlikte kabul edilir.
  if (mock && !live && !prefix) {
    const msg = "PAYTR_MOCK açık ama PAYTR_OID_PREFIX boş — canlı dışı ortam işareti yok (ör. STG)."
    ;(isProd ? errors : warnings).push(msg)
  }

  // 4. Test modunda uyarılar.
  if (!live && !prefix && isProd) {
    warnings.push(
      "PAYTR_TEST_MODE=1 ve PAYTR_OID_PREFIX boş — canlı görünümlü env test modunda; " +
        "staging ise PAYTR_OID_PREFIX=STG yazın, canlıysa PAYTR_TEST_MODE=0."
    )
  }
  if (!live && missingCreds.length && !mock) {
    warnings.push(
      `PayTR kimlikleri eksik (${missingCreds.join(", ")}); get-token başarısız olur. Lokal için PAYTR_MOCK=1.`
    )
  }
  if (prefix && !/^[a-zA-Z0-9]+$/.test(prefix)) {
    warnings.push("PAYTR_OID_PREFIX yalnızca harf/rakam olmalı; diğer karakterler atılır.")
  }

  return { errors, warnings }
}

export function isPaytrEnvStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV || "").trim() === "production" || truthy(env.PAYTR_ENV_STRICT)
}

type BootLogger = {
  warn: (m: string) => void
  error: (m: string) => void
}

/** Boot'ta çağrılır. Strict modda hata varsa throw — süreç başlamaz. */
export function assertPaytrEnvAtBoot(
  log: BootLogger = console,
  env: NodeJS.ProcessEnv = process.env
): PaytrEnvReport {
  const report = checkPaytrEnv(env)
  for (const w of report.warnings) log.warn(`[paytr/env] ${w}`)
  for (const e of report.errors) log.error(`[paytr/env] ${e}`)
  if (report.errors.length && isPaytrEnvStrict(env)) {
    throw new Error(
      `PayTR env doğrulaması başarısız (${report.errors.length} hata): ${report.errors.join(" | ")}`
    )
  }
  return report
}
