import { test, expect } from "@playwright/test"
import { AccountPage } from "../../fixtures/page-objects/account.page"
import { OrderTrackingPage } from "../../fixtures/page-objects/order-tracking.page"
import { RegisterPage } from "../../fixtures/page-objects/register.page"
import { placeGuestOrderViaApi } from "../../utils/place-order"
import { expectRegisterPending } from "../../utils/register-pending"
import { uniqueEmail } from "../../utils/env"

/**
 * Guest checkout + same-email register is allowed (verify-pending).
 * Guest orders are attached to the new account only AFTER email verification
 * (mailbox token). Until then they remain reachable via /order-tracking.
 */
test.describe("7. Misafir → üyelik", () => {
  test("aynı email ile kayıt olur; doğrulamadan sipariş takipte kalır", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const fx = await placeGuestOrderViaApi("guest-reg")
    const register = new RegisterPage(page)
    await register.goto()
    await register.submitForm({
      email: fx.email,
      password: "StagingE2E2026!a",
    })

    await expectRegisterPending(page, register.pending)
    if (await register.error.isVisible().catch(() => false)) {
      const text = (await register.error.textContent()) || ""
      throw new Error(
        `Unexpected register block for guest email (orders would be unclaimable): ${text}`
      )
    }
    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(fx.id, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })

    // Unverified login must not open siparişlerim (security gate).
    const account = new AccountPage(page)
    await account.openLogin()
    await account.login(fx.email, "StagingE2E2026!a")
    await expect(page.getByTestId("register-pending")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page).not.toHaveURL(/\/hesabim(?:\/|$)/)
  })

  test("farklı email ile üye olunca başkasının misafir siparişi görünmez", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const fx = await placeGuestOrderViaApi("guest-iso")
    const otherEmail = uniqueEmail("guest-other")

    const register = new RegisterPage(page)
    await register.goto()
    await register.submitForm({
      email: otherEmail,
      password: "StagingE2E2026!a",
    })
    await expectRegisterPending(page, register.pending)

    const tracking = new OrderTrackingPage(page)
    await tracking.goto()
    await tracking.lookup(fx.id, otherEmail)
    await expect(tracking.error).toBeVisible({ timeout: 20_000 })

    await tracking.lookupAndWait(fx.id, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })
  })
})
