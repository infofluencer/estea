import { FetchError } from "@medusajs/js-sdk"
import { describe, expect, it } from "vitest"
import { errMessage } from "../auth/errors"

describe("errMessage", () => {
  it("FetchError mesajı kırpılır, boşsa yedek", () => {
    expect(errMessage(new FetchError("  Invalid email or password  ", "Unauthorized", 401), "x")).toBe(
      "Invalid email or password"
    )
    expect(errMessage(new FetchError("   ", "Unauthorized", 401), "Giriş başarısız.")).toBe("Giriş başarısız.")
  })

  it("message alanı olan nesneler", () => {
    expect(errMessage(new Error("Bağlantı koptu"), "x")).toBe("Bağlantı koptu")
    expect(errMessage({ message: "düz nesne" }, "x")).toBe("düz nesne")
  })

  it.each([null, undefined, "metin", 42, {}, { message: 5 }, { message: "  " }, new Error("")])(
    "mesajsız: %j → yedek",
    (e) => {
      expect(errMessage(e, "Bir hata oluştu.")).toBe("Bir hata oluştu.")
    }
  )
})
