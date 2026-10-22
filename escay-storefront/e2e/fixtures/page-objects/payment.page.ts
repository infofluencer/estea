import type { Locator, Page } from "@playwright/test"
import { expect } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

/** PayTR iframe step — never types inside the iframe (cross-origin). */
export class PaymentPage {
  readonly page: Page
  readonly heading: Locator
  readonly frame: Locator
  readonly iframe: Locator
  readonly back: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole("heading", { name: "Ödeme" })
    this.frame = page.getByTestId("checkout-payment")
    this.iframe = page.getByTestId("paytr-iframe")
    this.back = page.getByTestId("checkout-payment-back")
  }

  async gotoStubToken(token: string) {
    await skipSiteOverlays(this.page)
    await this.page.goto(`/odeme/payment/${token}`, {
      waitUntil: "domcontentloaded",
    })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async expectIframeForToken(token: string | RegExp) {
    await expect(this.heading).toBeVisible()
    await expect(this.frame).toBeVisible()
    await expect(this.iframe).toBeVisible()
    const src =
      typeof token === "string"
        ? `https://www.paytr.com/odeme/guvenli/${token}`
        : /https:\/\/www\.paytr\.com\/odeme\/guvenli\/.+/
    await expect(this.iframe).toHaveAttribute("src", src)
  }

  async goBackToAddress() {
    await this.back.click()
    await this.page.waitForURL(/\/odeme\/?$/, { timeout: 20_000 })
  }
}
