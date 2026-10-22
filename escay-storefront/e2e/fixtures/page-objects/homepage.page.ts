import type { Page, Locator } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class HomepagePage {
  readonly page: Page
  readonly searchButton: Locator
  readonly searchInput: Locator
  readonly cartIcon: Locator
  readonly productCards: Locator
  readonly productLinks: Locator

  constructor(page: Page) {
    this.page = page
    // Prefer banner (desktop); fall back to first match
    this.searchButton = page
      .getByRole("banner")
      .getByTestId("search-button")
      .or(page.getByTestId("search-button").first())
    this.searchInput = page
      .getByRole("banner")
      .getByTestId("search-input")
      .or(page.getByTestId("search-input").first())
    this.cartIcon = page.getByTestId("cart-icon").first()
    this.productCards = page.locator(".featured__card")
    this.productLinks = page.locator('a[href*="/urun/"]')
  }

  async goto() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async dismissWelcome() {
    await dismissOverlays(this.page)
  }

  async openSearch(query: string) {
    await dismissOverlays(this.page)
    // Input may already be in the header layout — try focus/fill first
    const input = this.page.getByTestId("search-input").first()
    const btn = this.page.getByTestId("search-button").first()
    if (await input.isVisible().catch(() => false)) {
      await input.click({ force: true })
    } else {
      await btn.click({ force: true })
    }
    await input.fill(query)
  }

  async gotoCategories() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/urun-kategori", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }
}
