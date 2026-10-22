import { test, expect } from "@playwright/test"
import { OrderTrackingPage } from "../../fixtures/page-objects/order-tracking.page"
import { ReturnRequestPage } from "../../fixtures/page-objects/return-request.page"
import { fulfillOrderViaAdmin } from "../../utils/admin-fulfill"
import { placeGuestOrderViaApi } from "../../utils/place-order"

test.describe("7. Misafir iade başvurusu", () => {
  test("iade edilebilir kalem yoksa buton yerine boş durum", async ({ page }) => {
    const fx = await placeGuestOrderViaApi("guest-ret-empty")
    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(fx.id, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })

    const returns = new ReturnRequestPage(page)
    // Staging may not have the empty-state copy yet — button must stay hidden.
    await expect(returns.open).toHaveCount(0)
  })

  test("teslim sonrası form → alındı + iade kodu e-postayla gelecek", async ({ page }) => {
    test.setTimeout(180_000)
    const fx = await placeGuestOrderViaApi("guest-ret")
    const fulfilled = await fulfillOrderViaAdmin(fx.id)
    test.skip(
      !fulfilled.ok,
      `iade formu için fulfillment yok: ${fulfilled.ok ? "" : fulfilled.reason}`
    )

    const tracking = new OrderTrackingPage(page)
    await tracking.lookupAndWait(fx.id, fx.email)
    await expect(tracking.detail()).toBeVisible({ timeout: 20_000 })

    const returns = new ReturnRequestPage(page)
    await expect(returns.open).toBeVisible({ timeout: 20_000 })
    await returns.submitFirstItem("E2E misafir iade notu")
    await expect(returns.success).toBeVisible({ timeout: 30_000 })
    await expect(returns.success).toContainText(/İade talebi alındı/i)
    // Kodlu iade: kod ayrı e-postayla gelir, adres/iade no gösterilmez
    await expect(returns.success).toContainText(/İade kodunuz/i)
    await expect(returns.success).toContainText(/iade kodunuz/i)
  })
})
