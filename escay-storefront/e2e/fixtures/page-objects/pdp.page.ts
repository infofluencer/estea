import type { Page, Locator } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class PdpPage {
  readonly page: Page
  readonly addToCart: Locator
  readonly price: Locator
  readonly image: Locator

  constructor(page: Page) {
    this.page = page
    this.addToCart = page.getByTestId("add-to-cart")
    this.price = page.getByText(/₺|TL|KDV/i).first()
    this.image = page.locator("img").first()
  }

  async openFirstInStockFromCategories() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/urun-kategori", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)

    const links = this.page.locator(
      'a[href*="/urun/"]:not([class*="quickAdd"]):not([class*="mediaLink"])'
    )
    let count = await links.count()
    if (count === 0) {
      const any = this.page.locator('a[href*="/urun/"]')
      count = await any.count()
      for (let i = 0; i < Math.min(count, 12); i++) {
        const href = await any.nth(i).getAttribute("href")
        if (!href) continue
        await this.page.goto(href, { waitUntil: "domcontentloaded" })
        await waitForPageLoaderGone(this.page)
        await dismissOverlays(this.page)
        if (await this.addToCart.isEnabled().catch(() => false)) return
      }
      throw new Error("Stokta ürün bulunamadı")
    }

    for (let i = 0; i < Math.min(count, 12); i++) {
      const href = await links.nth(i).getAttribute("href")
      if (!href) continue
      await this.page.goto(href, { waitUntil: "domcontentloaded" })
      await waitForPageLoaderGone(this.page)
      await dismissOverlays(this.page)
      if (await this.addToCart.isEnabled().catch(() => false)) return
    }
    throw new Error("Stokta ürün bulunamadı")
  }

  async addProductToCart() {
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.addToCart.click()
    // Wait for server action + cookie write (toast or badge)
    await Promise.race([
      this.page.getByText("Sepete eklendi").waitFor({
        state: "visible",
        timeout: 30_000,
      }),
      this.page
        .getByTestId("cart-icon")
        .filter({ hasText: /\d/ })
        .waitFor({ state: "visible", timeout: 30_000 }),
      this.addToCart
        .filter({ hasNotText: /Ekleniyor/ })
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(async () => {
          const alert = this.page.getByRole("alert")
          if (await alert.isVisible().catch(() => false)) {
            throw new Error(
              `Sepete eklenemedi: ${await alert.textContent()}`
            )
          }
          // brief settle for Set-Cookie
          await this.page.waitForTimeout(500)
        }),
    ])
  }
}
