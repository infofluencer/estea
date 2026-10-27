import { test, expect } from "@playwright/test"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"

test.describe("1. Homepage", () => {
  test("açılır, ürünler render olur", async ({ page }) => {
    const home = new HomepagePage(page)
    await home.goto()
    await expect(page).toHaveTitle(/es çay/i)
    await expect(home.productCards.or(home.productLinks).first()).toBeVisible({
      timeout: 30_000,
    })
  })

  test("arama paneli açılır", async ({ page }) => {
    const home = new HomepagePage(page)
    await home.goto()
    await home.openSearch("şal")
    await expect(home.searchInput).toBeVisible()
  })

  test("kategori navigasyonu", async ({ page }) => {
    const home = new HomepagePage(page)
    await home.gotoCategories()
    await expect(home.productLinks.first()).toBeVisible({ timeout: 30_000 })
  })
})
