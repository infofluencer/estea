import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { NavBadges } from "../components/nav-badges"

/**
 * Kenar çubuğu rozetleri (İadeler / Siparişler) — görünür bir şey çizmez;
 * sık açılan sayfalarda mount olur, sayıları dakikada bir yeniler.
 */
const NavBadgesWidget = () => <NavBadges />

export const config = defineWidgetConfig({
  zone: [
    "order.list.before",
    "order.details.before",
    "product.list.before",
    "product.details.before",
    "customer.list.before",
    "customer.details.before",
    "inventory_item.list.before",
    "inventory_item.details.before",
    "promotion.list.before",
    "price_list.list.before",
  ],
})

export default NavBadgesWidget
