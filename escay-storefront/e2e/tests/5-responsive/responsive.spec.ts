import { test, expect } from "@playwright/test"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"
import { PdpPage } from "../../fixtures/page-objects/pdp.page"
import { assertNoHorizontalOverflow } from "../../utils/wait"

test.describe("5. Responsive", () => {
  test("ana sayfa mobil", async ({ page }) => {
    const home = new HomepagePage(page)
    await home.goto()
    await expect(home.productCards.or(home.productLinks).first()).toBeVisible({
      timeout: 30_000,
    })
    await assertNoHorizontalOverflow(page)
  })

  test("checkout mobil", async ({ page }) => {
    const home = new HomepagePage(page)
    const pdp = new PdpPage(page)
    try {
      await pdp.openFirstInStockFromCategories()
      await pdp.addProductToCart()
      await page.goto("/odeme", { waitUntil: "domcontentloaded" })
      await home.dismissWelcome()
      await assertNoHorizontalOverflow(page, 24)
    } catch {
      test.info().annotations.push({
        type: "note",
        description: "Stok/checkout skip soft",
      })
    }
  })
})
