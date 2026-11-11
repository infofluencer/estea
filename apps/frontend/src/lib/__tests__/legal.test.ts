import { describe, expect, it } from "vitest"
import { isDraftLegalVersion, LEGAL_PAGES, MEMBERSHIP_TERMS } from "../legal"

describe("hukuki metin sürümleri", () => {
  it("taslak eki tanınır", () => {
    expect(isDraftLegalVersion("2026-11-11-draft")).toBe(true)
    expect(isDraftLegalVersion("2026-12-01")).toBe(false)
  })

  it("üyelik sözleşmesi sürümü ile görünen tarih birlikte taslak/onaylı", () => {
    const draft = isDraftLegalVersion(MEMBERSHIP_TERMS.version)
    expect(MEMBERSHIP_TERMS.updatedAt.includes("taslak")).toBe(draft)
  })

  it("üyelik sözleşmesi altbilgi listesinde", () => {
    expect(LEGAL_PAGES.some((p) => p.href === "/legal/uyelik-sozlesmesi")).toBe(true)
  })
})
