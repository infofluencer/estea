import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const dns = vi.hoisted(() => ({
  resolveMx: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  ctorArgs: [] as unknown[],
}))

vi.mock("node:dns/promises", () => ({
  Resolver: class {
    constructor(opts: unknown) {
      dns.ctorArgs.push(opts)
    }
    resolveMx = dns.resolveMx
    resolve4 = dns.resolve4
    resolve6 = dns.resolve6
  },
}))

const dnsError = (code: string) => Object.assign(new Error(code), { code })

async function load() {
  vi.resetModules()
  return (await import("../email-domain")).emailDomainAcceptsMail
}

beforeEach(() => {
  dns.resolveMx.mockReset()
  dns.resolve4.mockReset()
  dns.resolve6.mockReset()
  dns.ctorArgs.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe("emailDomainAcceptsMail", () => {
  it("alan adı yok / noktasız → false (DNS'e gitmez)", async () => {
    const check = await load()
    expect(await check("ayse")).toBe(false)
    expect(await check("ayse@")).toBe(false)
    expect(await check("ayse@localhost")).toBe(false)
    expect(dns.resolveMx).not.toHaveBeenCalled()
  })

  it(".test TLD her zaman kabul (staging e2e)", async () => {
    const check = await load()
    expect(await check("e2e@escay.test")).toBe(true)
    expect(dns.resolveMx).not.toHaveBeenCalled()
  })

  it("MX varsa true; alan adı küçük harfe çevrilip kırpılır", async () => {
    dns.resolveMx.mockResolvedValue([{ exchange: "mx.gmail.com", priority: 5 }])
    const check = await load()
    expect(await check("  Ayse@GMAIL.com ")).toBe(true)
    expect(dns.resolveMx).toHaveBeenCalledWith("gmail.com")
    expect(dns.ctorArgs[0]).toEqual({ timeout: 3000, tries: 2 })
  })

  it("NXDOMAIN (gmail.con) → false", async () => {
    dns.resolveMx.mockRejectedValue(dnsError("ENOTFOUND"))
    const check = await load()
    expect(await check("ayse@gmail.con")).toBe(false)
  })

  it("null MX (RFC 7505) → false", async () => {
    dns.resolveMx.mockResolvedValue([{ exchange: ".", priority: 0 }])
    const check = await load()
    expect(await check("a@nomail.example")).toBe(false)
    dns.resolveMx.mockResolvedValue([{ exchange: "", priority: 0 }])
    expect(await check("a@nomail2.example")).toBe(false)
  })

  it("MX yok ama A kaydı var → true", async () => {
    dns.resolveMx.mockRejectedValue(dnsError("ENODATA"))
    dns.resolve4.mockResolvedValue(["1.2.3.4"])
    dns.resolve6.mockRejectedValue(dnsError("ENODATA"))
    const check = await load()
    expect(await check("a@a-only.com")).toBe(true)
  })

  it("MX, A ve AAAA kesin yok → false", async () => {
    dns.resolveMx.mockRejectedValue(dnsError("ENODATA"))
    dns.resolve4.mockRejectedValue(dnsError("ENODATA"))
    dns.resolve6.mockResolvedValue([])
    const check = await load()
    expect(await check("a@empty.com")).toBe(false)
  })

  it("A belirsiz (timeout), AAAA yok → kabul", async () => {
    dns.resolveMx.mockRejectedValue(dnsError("ENODATA"))
    dns.resolve4.mockRejectedValue(dnsError("ETIMEOUT"))
    dns.resolve6.mockRejectedValue(dnsError("ENODATA"))
    const check = await load()
    expect(await check("a@flaky.com")).toBe(true)
  })

  it("zaman aşımı / SERVFAIL kabul edilir ve önbelleğe alınmaz", async () => {
    dns.resolveMx.mockRejectedValueOnce(dnsError("ETIMEOUT"))
    const check = await load()
    expect(await check("a@slow.com")).toBe(true)
    dns.resolveMx.mockRejectedValueOnce(dnsError("ENOTFOUND"))
    expect(await check("a@slow.com")).toBe(false)
    expect(dns.resolveMx).toHaveBeenCalledTimes(2)
  })

  it("kesin sonuç 1 saat önbellekte kalır", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"))
    dns.resolveMx.mockRejectedValue(dnsError("ENOTFOUND"))
    const check = await load()
    expect(await check("a@gmail.con")).toBe(false)
    expect(await check("b@GMAIL.CON")).toBe(false)
    expect(dns.resolveMx).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date("2026-11-06T11:00:01Z"))
    dns.resolveMx.mockResolvedValue([{ exchange: "mx.gmail.con", priority: 1 }])
    expect(await check("a@gmail.con")).toBe(true)
    expect(dns.resolveMx).toHaveBeenCalledTimes(2)
  })
})
