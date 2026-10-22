import { test, expect } from "@playwright/test"
import { AccountPage } from "../../fixtures/page-objects/account.page"
import { CheckoutPage } from "../../fixtures/page-objects/checkout.page"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"
import { ReturnRequestPage } from "../../fixtures/page-objects/return-request.page"
import { seedGuestCartCookie } from "../../utils/seed-cart"
import { skipSiteOverlays, dismissOverlays, waitForPageLoaderGone } from "../../utils/wait"

test.describe("7. Üye karşılaştırma (kontrol)", () => {
  test("üye sipariş → hesap listesi → iade UI misafirle tutarlı", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const email = process.env.STAGING_VERIFIED_EMAIL?.trim()
    const password = process.env.STAGING_VERIFIED_PASSWORD?.trim()
    test.skip(!email || !password, "STAGING_VERIFIED_EMAIL/PASSWORD yok")

    const home = new HomepagePage(page)
    const account = new AccountPage(page)
    await account.openLogin()
    await home.dismissWelcome()
    await expect(account.loginEmail).toBeVisible({ timeout: 15_000 })
    await account.login(email!, password!)
    // Soft nav after login — wait before hard goto (cookie race on HTTP staging).
    await page.waitForURL(/\/hesabim/, {
      timeout: 30_000,
      waitUntil: "domcontentloaded",
    })
    await expect(
      page.getByText(/Merhaba|Hesabım|Siparişler|Pano/i).first()
    ).toBeVisible({ timeout: 15_000 })

    await skipSiteOverlays(page)
    await seedGuestCartCookie(page)
    const checkout = new CheckoutPage(page)
    await checkout.goto()
    await expect(checkout.email).toBeVisible({ timeout: 20_000 })
    // Logged-in checkout locks email — skip fill.
    await checkout.fillGuestAddress(email!, { skipEmail: true })
    await page.waitForTimeout(1200)
    await checkout.selectFirstShippingIfPresent()
    await checkout.submitAndWaitForConfirmation()
    await expect(
      page.getByRole("heading", { name: /Siparişiniz alındı/i })
    ).toBeVisible({ timeout: 20_000 })
    const match = page.url().match(/\/odeme\/confirmation\/([^/?#]+)/)
    const orderId = match?.[1] || ""
    expect(orderId).toBeTruthy()

    await page.goto("/hesabim", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(page)
    await dismissOverlays(page)
    await page.getByTestId("account-tab-orders").click()
    await expect(page.getByTestId("account-orders-list")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByTestId("account-order-link").first()).toBeVisible()

    await page.goto(`/hesabim/orders/${orderId}`, {
      waitUntil: "domcontentloaded",
    })
    await waitForPageLoaderGone(page)
    await expect(page.getByTestId("order-detail")).toBeVisible({
      timeout: 20_000,
    })

    // Fresh order is not delivered — return CTA must stay hidden (same as guest).
    const returns = new ReturnRequestPage(page)
    await expect(returns.open).toHaveCount(0)
  })
})
