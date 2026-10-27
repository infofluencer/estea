import type { Page, Locator } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class CartPage {
  readonly page: Page
  readonly root: Locator
  readonly checkoutLink: Locator
  readonly promoInput: Locator
  readonly promoApply: Locator
  readonly promoError: Locator
  readonly promoApplied: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.locator(".cart-page-wrap, main").first()
    this.checkoutLink = page.getByRole("link", {
      name: /ödeme|checkout|alışverişi tamamla/i,
    })
    this.promoInput = page
      .getByTestId("checkout-promo-input")
      .or(page.locator(".checkout-promo__input"))
    this.promoApply = page
      .getByTestId("checkout-promo-apply")
      .or(page.locator(".checkout-promo__apply"))
    this.promoError = page
      .getByTestId("checkout-promo-error")
      .or(page.locator(".checkout-promo [role='alert']"))
    this.promoApplied = page
      .getByTestId("checkout-promo-applied")
      .or(page.locator(".checkout-promo__applied"))
  }

  async goto() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/sepet", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async applyPromo(code: string) {
    await this.promoInput.fill(code)
    await this.promoApply.click()
  }
}
