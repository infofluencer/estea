import { SiteHeaderBar } from "@/components/SiteHeaderBar"
import { getLoggedInCustomer } from "@/lib/auth/customer"
import { getCart } from "@/lib/cart"
import { countCartItems } from "@/lib/cart-events"
import { getStoreCategories } from "@/lib/store-categories"

export async function SiteHeader() {
  const [cart, customer, categories] = await Promise.all([
    getCart(),
    getLoggedInCustomer(),
    getStoreCategories(),
  ])

  return (
    <SiteHeaderBar
      cartCount={countCartItems(cart)}
      isLoggedIn={Boolean(customer)}
      categories={categories.map(({ handle, name }) => ({ handle, name }))}
    />
  )
}
