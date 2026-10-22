import { test, expect } from "@playwright/test"
import { PdpPage } from "../../fixtures/page-objects/pdp.page"
import { CartPage } from "../../fixtures/page-objects/cart.page"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"

test.describe("1b. PDP + Sepet", () => {
  test("PDP: fiyat, görsel, sepete ekle", async ({ page }) => {
    const pdp = new PdpPage(page)
    await pdp.openFirstInStockFromCategories()
    await expect(pdp.price).toBeVisible({ timeout: 20_000 })
    await expect(pdp.image).toBeVisible()
    await expect(pdp.addToCart).toBeVisible()
    await pdp.addProductToCart()
  })

  test("Sepet sayfası ürün gösterir", async ({ page }) => {
    // Seed via API — HTTP staging drops Secure cookies from UI add-to-cart
    const { seedGuestCartCookie } = await import("../../utils/seed-cart")
    const { CartPage } = await import("../../fixtures/page-objects/cart.page")
    await seedGuestCartCookie(page)
    const cart = new CartPage(page)
    await cart.goto()
    await expect(cart.root).toBeVisible()
    await expect(
      page.getByText(/ara toplam|kdv dahil|adet/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })
  test("yasal sayfalar", async ({ page }) => {
    const home = new HomepagePage(page)
    for (const path of [
      "/legal/gizlilik-kvkk",
      "/legal/mesafeli-satis-sozlesmesi",
      "/faq",
    ]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" })
      expect(res?.ok()).toBeTruthy()
      await home.dismissWelcome()
    }
  })
})
