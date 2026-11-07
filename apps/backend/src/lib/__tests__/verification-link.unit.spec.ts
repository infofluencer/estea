import { decideVerificationRequest } from "../verification-link"

const NOW = new Date("2026-11-05T12:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MIN = 60_000
const HOUR = 60 * MIN

const decide = (
  requestedAgoMs: number,
  opts: { auto: boolean; mailOnRecord?: boolean; verified?: boolean }
) =>
  decideVerificationRequest({
    verification: {
      requested_at: ago(requestedAgoMs),
      verified_at: opts.verified ? ago(MIN) : null,
    },
    auto: opts.auto,
    mailOnRecord: opts.mailOnRecord ?? true,
    now: NOW,
  })

describe("decideVerificationRequest", () => {
  it("ilk istek → yeni bağlantı", () => {
    expect(
      decideVerificationRequest({ verification: undefined, auto: true, mailOnRecord: false, now: NOW })
    ).toEqual({ action: "issue" })
  })

  it("2 sn arayla çift istek → ikincisi bağlantıyı bozmaz", () => {
    expect(decide(2_000, { auto: true })).toMatchObject({ action: "keep", reason: "cooldown" })
    expect(decide(2_000, { auto: false })).toMatchObject({ action: "keep", reason: "cooldown" })
  })

  it("mail kaydı henüz yazılmamışsa da cooldown korur", () => {
    expect(decide(10, { auto: true, mailOnRecord: false })).toMatchObject({ reason: "cooldown" })
  })

  it("cooldown kalan süreyi bildirir", () => {
    expect(decide(30_000, { auto: false })).toMatchObject({ retryAfterMs: 90_000 })
  })

  it("giriş denemesi gönderilmiş ve geçerli bağlantıyı yenilemez", () => {
    expect(decide(5 * HOUR, { auto: true })).toMatchObject({
      action: "keep",
      reason: "link_still_valid",
    })
  })

  it("giriş denemesi: bağlantının maili gönderilemediyse yenisi üretilir", () => {
    expect(decide(5 * HOUR, { auto: true, mailOnRecord: false })).toEqual({ action: "issue" })
  })

  it("giriş denemesi: bağlantı bitmek üzereyse yenisi üretilir", () => {
    expect(decide(23 * HOUR, { auto: true })).toEqual({ action: "issue" })
  })

  it("Tekrar gönder: cooldown sonrası yeni bağlantı üretir", () => {
    expect(decide(2 * MIN, { auto: false })).toEqual({ action: "issue" })
  })

  it("doğrulanmış hesapta token yenilenmez", () => {
    expect(decide(5 * HOUR, { auto: false, verified: true })).toMatchObject({
      action: "keep",
      reason: "verified",
    })
  })
})
