import { SiteHeaderBar } from "@/components/SiteHeaderBar"
import { getLoggedInCustomer } from "@/lib/auth/customer"
import { getCart } from "@/lib/cart"
import { countCartItems } from "@/lib/cart-events"

export async function SiteHeader() {
  const cart = await getCart()
  const cartCount = countCartItems(cart)
  const customer = await getLoggedInCustomer()

  return <SiteHeaderBar cartCount={cartCount} isLoggedIn={Boolean(customer)} />
}
