import { test, expect } from "@playwright/test"
import { CheckoutPage } from "../../fixtures/page-objects/checkout.page"
import { uniqueEmail } from "../../utils/env"
import { guestCheckoutToConfirmation } from "../../utils/order-flow"
import { seedGuestCartCookie } from "../../utils/seed-cart"
import { skipSiteOverlays } from "../../utils/wait"

test.describe("3. Checkout", () => {
  test("sepet → adres → kargo → PayTR stub → confirmation", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const { orderId } = await guestCheckoutToConfirmation(page)
    expect(orderId, `confirmation URL: ${page.url()}`).toBeTruthy()
    await expect(page).toHaveURL(/\/odeme\/confirmation\//)
    // Guest detail fetch may fail on HTTP (Secure last-order cookie) — heading is enough
    await expect(
      page.getByRole("heading", { name: /Siparişiniz alındı/i })
    ).toBeVisible({ timeout: 20_000 })
  })

  test("ödeme route iframe render (sepete bakmaz)", async ({ page }) => {
    const token = "e2ePaytrToken1"
    await page.goto(`/odeme/payment/${token}`, {
      waitUntil: "domcontentloaded",
    })
    await expect(page.getByRole("heading", { name: "Ödeme" })).toBeVisible()
    await expect(page.getByTestId("checkout-payment")).toBeVisible()
    const iframe = page.getByTestId("paytr-iframe")
    await expect(iframe).toBeVisible()
    await expect(iframe).toHaveAttribute(
      "src",
      `https://www.paytr.com/odeme/guvenli/${token}`
    )
    await expect(page.getByTestId("checkout-payment-back")).toHaveAttribute(
      "href",
      "/odeme"
    )
    await expect(page.getByLabel("Sipariş adımları")).toBeVisible()
    await expect(page.getByText("Ödeme", { exact: true }).first()).toBeVisible()
  })

  test("adres → ödemeye geç → ödeme adımı veya stub confirmation", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await skipSiteOverlays(page)
    await seedGuestCartCookie(page)

    const checkout = new CheckoutPage(page)
    await checkout.goto()
    await expect(checkout.email).toBeVisible({ timeout: 20_000 })
    await checkout.fillGuestAddress(uniqueEmail("paytr"))
    await page.waitForTimeout(1200)
    await checkout.selectFirstShippingIfPresent()
    await checkout.submitAndWaitForPaymentOrConfirmation()

    if (/\/odeme\/payment\//.test(page.url())) {
      const iframe = page.getByTestId("paytr-iframe")
      await expect(iframe).toBeVisible()
      await expect(iframe).toHaveAttribute(
        "src",
        /https:\/\/www\.paytr\.com\/odeme\/guvenli\/.+/
      )
      return
    }

    await expect(page).toHaveURL(/\/odeme\/confirmation\//)
  })
})
