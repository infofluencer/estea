import { describe, expect, it } from "vitest"
import { isSafePaytrIframeToken } from "../paytr-iframe-token"

describe("isSafePaytrIframeToken", () => {
  it.each(["abcdEFGH", "a1b2c3d4e5_f-6", "x".repeat(200)])("geçerli: %s", (t) => {
    expect(isSafePaytrIframeToken(t)).toBe(true)
  })

  it.each([
    null,
    undefined,
    "",
    "short7c",
    "x".repeat(201),
    "abc/def/ghi",
    "../../etc/passwd",
    "token?x=1abc",
    "abcdefgh ",
    "abcdefgh\n",
    "çaytokeni123",
  ])("geçersiz: %j", (t) => {
    expect(isSafePaytrIframeToken(t)).toBe(false)
  })

  it("sayı gibi string olmayan değerler reddedilir", () => {
    expect(isSafePaytrIframeToken(12345678 as unknown as string)).toBe(false)
  })
})
