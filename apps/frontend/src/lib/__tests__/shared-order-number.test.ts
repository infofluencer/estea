import { describe, expect, it } from "vitest"
import {
  ORDER_NUMBER_BASE,
  formatOrderNumber,
  parseOrderNumber,
  resolveOrderNumberLabel,
} from "@escay/shared/order-number"

describe("formatOrderNumber", () => {
  it("display_id + 100000", () => {
    expect(ORDER_NUMBER_BASE).toBe(100_000)
    expect(formatOrderNumber(3)).toBe("100003")
    expect(formatOrderNumber("42")).toBe("100042")
    expect(formatOrderNumber(" 7 ")).toBe("100007")
  })

  it.each([null, undefined, "", 0, -1, 1.5, "abc", Number.NaN])("geçersiz: %s → null", (v) => {
    expect(formatOrderNumber(v as number | string | null | undefined)).toBeNull()
  })
})

describe("parseOrderNumber", () => {
  it("müşteri formatı (#100003 / 100003) display_id'ye çevrilir", () => {
    expect(parseOrderNumber("#100003")).toEqual({ kind: "display_id", displayId: 3 })
    expect(parseOrderNumber(" ##100003 ")).toEqual({ kind: "display_id", displayId: 3 })
    expect(parseOrderNumber("100003")).toEqual({ kind: "display_id", displayId: 3 })
  })

  it("kısa numara olduğu gibi display_id", () => {
    expect(parseOrderNumber("3")).toEqual({ kind: "display_id", displayId: 3 })
    expect(parseOrderNumber("#3")).toEqual({ kind: "display_id", displayId: 3 })
    expect(parseOrderNumber("99999")).toEqual({ kind: "display_id", displayId: 99999 })
  })

  it("order_ kimliği", () => {
    expect(parseOrderNumber("order_01ABC")).toEqual({ kind: "order_id", orderId: "order_01ABC" })
    expect(parseOrderNumber("ORDER_01abc")).toEqual({ kind: "order_id", orderId: "ORDER_01abc" })
  })

  it.each(["", "   ", "#", "0", "100000", "-5", "12a", "1 000", "1.5"])("geçersiz: %j", (raw) => {
    expect(parseOrderNumber(raw)).toEqual({ kind: "invalid" })
  })

  it("format → parse gidiş-dönüş", () => {
    for (const id of [1, 9, 12345, 99999, 100001]) {
      expect(parseOrderNumber(`#${formatOrderNumber(id)}`)).toEqual({
        kind: "display_id",
        displayId: id,
      })
    }
  })
})

describe("resolveOrderNumberLabel", () => {
  it("display_id → custom_display_id → id son 8 karakter", () => {
    expect(resolveOrderNumberLabel({ id: "order_01HXYZABCDEF", display_id: 5 })).toBe("100005")
    expect(
      resolveOrderNumberLabel({ id: "order_01HXYZABCDEF", display_id: null, custom_display_id: " ES-9 " })
    ).toBe("ES-9")
    expect(resolveOrderNumberLabel({ id: "order_01HXYZABCDEF", custom_display_id: "  " })).toBe("YZABCDEF")
  })
})
