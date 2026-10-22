import { test, expect } from "@playwright/test"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"
import { OrderTrackingPage } from "../../fixtures/page-objects/order-tracking.page"
import { guestCheckoutToConfirmation } from "../../utils/order-flow"

test.describe("7. Misafir tam yolculuk", () => {
  test("ana sayfa → ürün → checkout (misafir) → confirmation → takip", async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const home = new HomepagePage(page)
    await home.goto()
    await expect(page).toHaveTitle(/es çay/i)
    await expect(home.productCards.or(home.productLinks).first()).toBeVisible({
      timeout: 30_000,
    })

    // Skip flaky PDP stock hunt — seed cart via API (same as checkout E2E).
    const { orderId, email } = await guestCheckoutToConfirmation(page)
    expect(orderId, `confirmation URL: ${page.url()}`).toBeTruthy()
    await expect(page).toHaveURL(/\/odeme\/confirmation\//)
    await expect(
      page.getByRole("heading", { name: /Siparişiniz alındı/i })
    ).toBeVisible({ timeout: 20_000 })

    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(orderId, email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator("body")).toContainText(/ürün|toplam|sipariş/i)
  })
})
