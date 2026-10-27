import { expect, type Page } from "@playwright/test"
import { CheckoutPage } from "../fixtures/page-objects/checkout.page"
import { uniqueEmail } from "./env"
import { seedGuestCartCookie } from "./seed-cart"
import { skipSiteOverlays, dismissOverlays, waitForPageLoaderGone } from "./wait"

/**
 * Guest stub checkout → confirmation.
 * Seeds cart via Store API + cookie (HTTP staging drops Secure cookies from UI add-to-cart).
 */
export async function guestCheckoutToConfirmation(page: Page) {
  await skipSiteOverlays(page)
  await seedGuestCartCookie(page)

  const checkout = new CheckoutPage(page)
  await checkout.goto()
  await expect(checkout.email).toBeVisible({ timeout: 20_000 })
  const email = uniqueEmail("checkout")
  await checkout.fillGuestAddress(email)
  await page.waitForTimeout(1200)
  await checkout.selectFirstShippingIfPresent()
  await checkout.submitAndWaitForConfirmation()

  const match = page.url().match(/\/odeme\/confirmation\/([^/?#]+)/)
  return { orderId: match?.[1] || "", email }
}

/** PDP add-to-cart path — for cart page assertions (may fail on HTTP Secure cookie). */
export async function addViaUiAndOpenCart(page: Page) {
  const { PdpPage } = await import("../fixtures/page-objects/pdp.page")
  const { CartPage } = await import("../fixtures/page-objects/cart.page")
  const pdp = new PdpPage(page)
  await pdp.openFirstInStockFromCategories()
  await pdp.addProductToCart()
  const cart = new CartPage(page)
  await cart.goto()
  await waitForPageLoaderGone(page)
  await dismissOverlays(page)
}
