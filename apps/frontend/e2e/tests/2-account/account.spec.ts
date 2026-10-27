import { test, expect } from "@playwright/test"
import { AccountPage } from "../../fixtures/page-objects/account.page"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"
import { uniqueEmail } from "../../utils/env"

test.describe("2. Account", () => {
  test("kayıt → verify pending", async ({ page }) => {
    const home = new HomepagePage(page)
    const account = new AccountPage(page)
    await account.openRegister()
    await home.dismissWelcome()
    await expect(account.regEmail).toBeVisible({ timeout: 15_000 })
    await account.register({
      email: uniqueEmail("account"),
      password: "StagingE2E2026!a",
    })
    await expect(
      page.getByText(/doğrulama|e-posta|kayıt.*alındı|tekrar gönder/i).first()
    ).toBeVisible({ timeout: 30_000 })
  })

  test("favorilere ekle (misafir)", async ({ page }) => {
    const home = new HomepagePage(page)
    // Categories grid is static (homepage carousel animates → unstable clicks)
    await home.gotoCategories()
    const fav = page
      .locator(
        '[data-testid="favorite-toggle"], button[aria-label="Favorilere ekle"]'
      )
      .first()
    await expect(fav).toBeVisible({ timeout: 30_000 })
    await fav.scrollIntoViewIfNeeded()
    await fav.click({ force: true })
    await page.goto("/istek-listesi", { waitUntil: "domcontentloaded" })
    await expect(
      page.locator(".favorites-card, .featured__card, .favorites-grid__item").first()
    ).toBeVisible({ timeout: 15_000 })
  })

  test("verified login (opsiyonel)", async ({ page }) => {
    const email = process.env.STAGING_VERIFIED_EMAIL?.trim()
    const password = process.env.STAGING_VERIFIED_PASSWORD?.trim()
    test.skip(!email || !password, "STAGING_VERIFIED_EMAIL/PASSWORD yok")

    const home = new HomepagePage(page)
    const account = new AccountPage(page)
    await account.openLogin()
    await home.dismissWelcome()
    await expect(account.loginEmail).toBeVisible({ timeout: 15_000 })
    await account.login(email!, password!)
    // LoginPanel router.push("/hesabim") — Next soft nav may never fire "load"
    await page.waitForURL(/\/hesabim/, {
      timeout: 30_000,
      waitUntil: "domcontentloaded",
    })
    await expect(
      page.getByText(/Merhaba|Hesabım|Siparişler|Pano/i).first()
    ).toBeVisible({ timeout: 15_000 })
  })
})
