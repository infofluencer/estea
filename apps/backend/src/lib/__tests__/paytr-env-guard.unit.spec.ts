import {
  assertPaytrEnvAtBoot,
  checkPaytrEnv,
  isPaytrEnvStrict,
} from "../../modules/paytr/env-guard"

const CREDS = {
  PAYTR_MERCHANT_ID: "123",
  PAYTR_MERCHANT_KEY: "key",
  PAYTR_MERCHANT_SALT: "salt",
}

describe("paytr env-guard", () => {
  it("canlı prod env (açık bayraklar, önek boş) temizdir", () => {
    const r = checkPaytrEnv({ NODE_ENV: "production", PAYTR_TEST_MODE: "0", PAYTR_OID_PREFIX: "", ...CREDS })
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it("staging env (test modu + STG öneki + mock) prod NODE_ENV'de kabul edilir", () => {
    const r = checkPaytrEnv({
      NODE_ENV: "production",
      PAYTR_TEST_MODE: "1",
      PAYTR_OID_PREFIX: "STG",
      PAYTR_MOCK: "1",
    })
    expect(r.errors).toEqual([])
  })

  it("prod'da PAYTR_TEST_MODE tanımsızsa HATA (sessiz test modu tuzağı)", () => {
    const r = checkPaytrEnv({ NODE_ENV: "production", ...CREDS })
    expect(r.errors.some((e) => e.includes("PAYTR_TEST_MODE tanımsız"))).toBe(true)
  })

  it("lokalde PAYTR_TEST_MODE tanımsızsa yalnız uyarı", () => {
    const r = checkPaytrEnv({ NODE_ENV: "development" })
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes("PAYTR_TEST_MODE tanımsız"))).toBe(true)
  })

  it("geçersiz PAYTR_TEST_MODE değeri hata", () => {
    const r = checkPaytrEnv({ PAYTR_TEST_MODE: "yes", ...CREDS })
    expect(r.errors.some((e) => e.includes("geçersiz"))).toBe(true)
  })

  it("canlı mod + PAYTR_OID_PREFIX dolu → hata (get-token reddi, Meta/Omnisend sessiz)", () => {
    const r = checkPaytrEnv({ PAYTR_TEST_MODE: "0", PAYTR_OID_PREFIX: "STG", ...CREDS })
    expect(r.errors.some((e) => e.includes("PAYTR_OID_PREFIX=STG"))).toBe(true)
  })

  it("canlı mod + mock → hata; canlı mod + eksik kimlik → hata", () => {
    const mock = checkPaytrEnv({ PAYTR_TEST_MODE: "0", PAYTR_MOCK: "1", ...CREDS })
    expect(mock.errors.some((e) => e.includes("PAYTR_MOCK"))).toBe(true)

    const creds = checkPaytrEnv({ PAYTR_TEST_MODE: "0", PAYTR_MERCHANT_ID: "1" })
    expect(creds.errors.some((e) => e.includes("PAYTR_MERCHANT_KEY"))).toBe(true)
    expect(creds.errors.some((e) => e.includes("PAYTR_MERCHANT_SALT"))).toBe(true)
  })

  it("prod'da mock açık ama önek boşsa hata; lokalde uyarı", () => {
    const prod = checkPaytrEnv({ NODE_ENV: "production", PAYTR_TEST_MODE: "1", PAYTR_MOCK: "1" })
    expect(prod.errors.some((e) => e.includes("PAYTR_MOCK açık ama PAYTR_OID_PREFIX boş"))).toBe(true)
    const dev = checkPaytrEnv({ NODE_ENV: "development", PAYTR_TEST_MODE: "1", PAYTR_MOCK: "1" })
    expect(dev.errors).toEqual([])
    expect(dev.warnings.some((w) => w.includes("PAYTR_MOCK açık"))).toBe(true)
  })

  it("prod'da test modu + önek boş → uyarı (canlı görünümlü env test modunda)", () => {
    const r = checkPaytrEnv({ NODE_ENV: "production", PAYTR_TEST_MODE: "1", ...CREDS })
    expect(r.errors).toEqual([])
    expect(r.warnings.some((w) => w.includes("PAYTR_OID_PREFIX boş"))).toBe(true)
  })

  it("strict: production ya da PAYTR_ENV_STRICT=1", () => {
    expect(isPaytrEnvStrict({ NODE_ENV: "production" })).toBe(true)
    expect(isPaytrEnvStrict({ NODE_ENV: "development", PAYTR_ENV_STRICT: "1" })).toBe(true)
    expect(isPaytrEnvStrict({ NODE_ENV: "development" })).toBe(false)
  })

  it("assertPaytrEnvAtBoot strict modda hata varsa throw eder, değilse loglar", () => {
    const log = { warn: jest.fn(), error: jest.fn() }
    expect(() =>
      assertPaytrEnvAtBoot(log, { NODE_ENV: "production", PAYTR_TEST_MODE: "0", PAYTR_OID_PREFIX: "STG", ...CREDS })
    ).toThrow(/PayTR env doğrulaması başarısız/)
    expect(log.error).toHaveBeenCalled()

    const devLog = { warn: jest.fn(), error: jest.fn() }
    expect(() =>
      assertPaytrEnvAtBoot(devLog, { NODE_ENV: "development", PAYTR_TEST_MODE: "0", PAYTR_OID_PREFIX: "STG", ...CREDS })
    ).not.toThrow()
    expect(devLog.error).toHaveBeenCalled()
  })
})
