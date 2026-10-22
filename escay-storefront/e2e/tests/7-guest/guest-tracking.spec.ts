import { test, expect } from "@playwright/test"
import { OrderTrackingPage } from "../../fixtures/page-objects/order-tracking.page"
import { placeGuestOrderViaApi } from "../../utils/place-order"

const NOT_FOUND = /Sipariş bulunamadı|kontrol edin/i

test.describe("7. Misafir sipariş takibi (edge)", () => {
  test("doğru numara + doğru email → sipariş", async ({ page }) => {
    const fx = await placeGuestOrderViaApi("track-ok")
    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(fx.id, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })
    await expect(tracking.detail()).toContainText(/sipariş/i)
  })

  test("doğru numara + yanlış email → generic bulunamadı", async ({ page }) => {
    const fx = await placeGuestOrderViaApi("track-wrong")
    const tracking = new OrderTrackingPage(page)
    await tracking.goto()
    await tracking.lookup(fx.id, "wrong@example.invalid")
    await expect(tracking.error).toBeVisible({ timeout: 20_000 })
    await expect(tracking.error).toHaveText(NOT_FOUND)
    await expect(page.locator("body")).not.toContainText(/email hatalı|yanlış e-posta/i)
  })

  test("numara formatı UI: #100xxx", async ({ page }) => {
    // Plain display_id / 100xxx covered by shared parseOrderNumber + backend smoke.
    const fx = await placeGuestOrderViaApi("track-fmt")
    test.skip(!fx.sixDigit, "display_id yok")
    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(`#${fx.sixDigit}`, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })
  })

  test("var olmayan numara → bulunamadı", async ({ page }) => {
    const tracking = new OrderTrackingPage(page)
    await tracking.goto()
    await tracking.lookup("order_does_not_exist_zzz", "nobody@escay.test")
    await expect(tracking.error).toBeVisible({ timeout: 20_000 })
    await expect(tracking.error).toHaveText(NOT_FOUND)
  })
})
