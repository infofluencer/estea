import { test, expect } from "@playwright/test"
import { AccountPage } from "../../fixtures/page-objects/account.page"
import { AuthPage } from "../../fixtures/page-objects/auth.page"
import { HomepagePage } from "../../fixtures/page-objects/homepage.page"
import { RegisterPage } from "../../fixtures/page-objects/register.page"
import { uniqueEmail } from "../../utils/env"
import { placeGuestOrderViaApi } from "../../utils/place-order"
import { expectRegisterPending } from "../../utils/register-pending"

const PASSWORD = "StagingE2E2026!a"

test.describe("2b. Auth akışları", () => {
  test("kayıt → verify-pending; doğrulanmadan giriş engellenir", async ({
    page,
  }) => {
    const home = new HomepagePage(page)
    const register = new RegisterPage(page)
    await register.goto()
    await home.dismissWelcome()
    const email = uniqueEmail("auth-reg")
    await register.submitForm({ email, password: PASSWORD })
    await expectRegisterPending(page, register.pending)
    await expect(page.getByText(email).first()).toBeVisible()
    await expect(page).not.toHaveURL(/\/hesabim(?:\/|$)/)

    const account = new AccountPage(page)
    await account.openLogin()
    await account.login(email, PASSWORD)
    await expect(page.getByTestId("register-pending")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page).not.toHaveURL(/\/hesabim(?:\/|$)/)
  })

  test("şifre sıfırlama akış adımları (SMTP yok — form + geçersiz token)", async ({
    page,
  }) => {
    const auth = new AuthPage(page)
    const email = uniqueEmail("auth-reset")

    await auth.gotoForgot()
    await expect(page.getByRole("heading", { name: /Şifremi Unuttum/i })).toBeVisible()
    await auth.requestReset(email)
    await expect(auth.forgotSuccess).toBeVisible({ timeout: 20_000 })
    await expect(auth.forgotSuccess).toContainText(
      /e-posta kayıtlıysa|şifre sıfırlama/i
    )

    await auth.gotoReset()
    await expect(auth.resetInvalid).toBeVisible()
    await expect(page.getByRole("heading", { name: /Geçersiz bağlantı/i })).toBeVisible()

    await auth.gotoReset(
      `?token=e2e-fake-token&email=${encodeURIComponent(email)}`
    )
    await expect(auth.resetForm).toBeVisible()
    await auth.newPassword.fill("short")
    await auth.confirmPassword.fill("short")
    await expect(auth.resetSubmit).toBeDisabled()

    await auth.newPassword.fill(PASSWORD)
    await auth.confirmPassword.fill("FarkliSifre2026!a")
    await expect(auth.resetSubmit).toBeDisabled()

    await auth.confirmPassword.fill(PASSWORD)
    await auth.resetSubmit.click()
    await expect(auth.resetError).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/reset-password/)
    await expect(page.getByText(/Şifre güncellendi/i)).toHaveCount(0)
  })

  test("doğrulama sayfası: token yok → geçersiz bağlantı adımı", async ({
    page,
  }) => {
    const auth = new AuthPage(page)
    await auth.gotoVerify()
    await expect(auth.verifyPage).toBeVisible()
    await expect(page.getByText(/Geçersiz veya eksik doğrulama/i)).toBeVisible()
  })

  test("misafir sipariş → aynı email üye ol → guest bağlama kapısı (doğrulama öncesi)", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const fx = await placeGuestOrderViaApi("auth-bind")
    const register = new RegisterPage(page)
    await register.goto()
    await register.submitForm({
      email: fx.email,
      password: PASSWORD,
    })
    await expectRegisterPending(page, register.pending)
    await expect(register.error).toHaveCount(0)

    const account = new AccountPage(page)
    await account.openLogin()
    await account.login(fx.email, PASSWORD)
    await expect(page.getByTestId("register-pending")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page).not.toHaveURL(/\/hesabim(?:\/|$)/)
  })
})
