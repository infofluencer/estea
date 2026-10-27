import { test, expect } from "@playwright/test"
import { CheckoutPage } from "../../fixtures/page-objects/checkout.page"
import { PaymentPage } from "../../fixtures/page-objects/payment.page"
import { uniqueEmail } from "../../utils/env"
import { seedGuestCartCookie } from "../../utils/seed-cart"
import { skipSiteOverlays, waitForPageLoaderGone } from "../../utils/wait"

test.describe("3c. Checkout adım akışı (Yol C)", () => {
  test("adres → ödemeye geç → PaytrIframe src token path (gerçek get-token veya stub)", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await skipSiteOverlays(page)
    await seedGuestCartCookie(page)

    const checkout = new CheckoutPage(page)
    await checkout.goto()
    await expect(checkout.email).toBeVisible({ timeout: 20_000 })
    await checkout.fillGuestAddress(uniqueEmail("yolc"))
    await page.waitForTimeout(1200)
    await checkout.selectFirstShippingIfPresent()
    await checkout.submitAndWaitForPaymentOrConfirmation()

    if (/\/odeme\/payment\//.test(page.url())) {
      const payment = new PaymentPage(page)
      await payment.expectIframeForToken(/.+/)
      const src = await payment.iframe.getAttribute("src")
      expect(src).toMatch(/^https:\/\/www\.paytr\.com\/odeme\/guvenli\/[A-Za-z0-9_-]{8,200}$/)
      test.info().annotations.push({
        type: "iframe",
        description: "gerçek get-token — PaytrIframe render, iframe içi ödeme YOK",
      })
      return
    }

    await expect(page).toHaveURL(/\/odeme\/confirmation\//)
    test.info().annotations.push({
      type: "iframe",
      description: "stub confirmation — PayTR token yok, iframe yok",
    })
  })

  test("ödeme adımında GERİ → /odeme; sepet + form korunur", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await skipSiteOverlays(page)
    await seedGuestCartCookie(page)

    const email = uniqueEmail("geri")
    const checkout = new CheckoutPage(page)
    await checkout.goto()
    await expect(checkout.email).toBeVisible({ timeout: 20_000 })
    await checkout.fillGuestAddress(email)
    await checkout.firstName.fill("GeriKoruma")
    await page.waitForTimeout(1400)

    const token = "e2eGeriBack1"
    const payment = new PaymentPage(page)
    await payment.gotoStubToken(token)
    await payment.expectIframeForToken(token)
    await payment.goBackToAddress()
    await waitForPageLoaderGone(page)

    await expect(page).toHaveURL(/\/odeme\/?$/)
    await expect(checkout.email).toBeVisible({ timeout: 20_000 })
    await expect(page.locator(".checkout-summary__item").first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(checkout.email).toHaveValue(email)
    await expect(checkout.firstName).toHaveValue("GeriKoruma")
    test.info().annotations.push({
      type: "iframe",
      description:
        "stub token path — GERİ; sepet cookie duruyor (complete yok), iframe içi ödeme YOK",
    })
  })

  test("ödeme adımında F5 → iframe hâlâ render (stub token path)", async ({
    page,
  }) => {
    const token = "e2eReloadTok"
    const payment = new PaymentPage(page)
    await payment.gotoStubToken(token)
    await payment.expectIframeForToken(token)

    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(page)
    await payment.expectIframeForToken(token)
    await expect(page).toHaveURL(new RegExp(`/odeme/payment/${token}`))
    test.info().annotations.push({
      type: "iframe",
      description: "stub token path — PaytrIframe render, get-token yok",
    })
  })

  test("/odeme/payment/[geçersiz-token] → güvenlik reddi", async ({
    page,
  }) => {
    await skipSiteOverlays(page)
    const res = await page.goto("/odeme/payment/bad", {
      waitUntil: "domcontentloaded",
    })
    expect(res?.status()).toBe(404)
    await expect(page.getByTestId("paytr-iframe")).toHaveCount(0)

    const dotted = await page.goto("/odeme/payment/not.valid!", {
      waitUntil: "domcontentloaded",
    })
    expect(dotted?.status()).toBe(404)
    await expect(page.getByTestId("paytr-iframe")).toHaveCount(0)
    test.info().annotations.push({
      type: "iframe",
      description: "isSafePaytrIframeToken reddi — iframe yok",
    })
  })

  test("boş sepet → /odeme boş kapı + restore", async ({ page }) => {
    await skipSiteOverlays(page)
    await page.goto("/odeme", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(page)

    await expect(
      page.getByText(/Sepet hazırlanıyor|Aktif sepet|Sepetiniz boş/i).first()
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId("checkout-empty")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole("link", { name: /Sepete git/i })).toBeVisible()
    await expect(page.getByTestId("checkout-email")).toHaveCount(0)
    await expect(page).toHaveURL(/\/odeme\/?$/)
  })
})
