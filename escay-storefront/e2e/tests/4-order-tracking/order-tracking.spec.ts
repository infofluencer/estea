import { test, expect } from "@playwright/test"
import { OrderTrackingPage } from "../../fixtures/page-objects/order-tracking.page"
import { placeGuestOrderViaApi } from "../../utils/place-order"

test.describe("4. Order-tracking", () => {
  test("doğru numara+email → detay", async ({ page }) => {
    const fx = await placeGuestOrderViaApi("track")
    // Prefer Medusa order_id — more reliable than display_id formatting
    const orderRef = fx.id
    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(orderRef, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator("body")).toContainText(/sipariş|ürün|toplam/i)
  })

  test("yanlış email → hata", async ({ page }) => {
    const fx = await placeGuestOrderViaApi("track")
    const tracking = new OrderTrackingPage(page)
    await tracking.goto()
    await tracking.lookup(fx.id, "wrong@example.invalid")
    await expect(tracking.error).toBeVisible({ timeout: 20_000 })
    await expect(tracking.error).toHaveText(/Sipariş bulunamadı|kontrol edin/i)
  })
})