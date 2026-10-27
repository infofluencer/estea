import { expect, test, type Locator, type Page } from "@playwright/test"

/**
 * Wait for verify-pending after register. Rate-limit is a skip, not a product fail.
 */
export async function expectRegisterPending(page: Page, pending: Locator) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (await pending.isVisible().catch(() => false)) {
      await expect(pending).toBeVisible()
      return
    }
    const err = page.getByTestId("register-error")
    if (await err.isVisible().catch(() => false)) {
      const text = ((await err.textContent()) || "").trim()
      if (/çok fazla|rate|429/i.test(text)) {
        test.skip(true, `Auth rate-limit: ${text}`)
      }
      throw new Error(`Register blocked: ${text}`)
    }
    await page.waitForTimeout(400)
  }
  throw new Error("Register neither pending nor error")
}
