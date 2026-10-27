import { CartLineItem, type CartLineItemData } from "./CartLineItem"
import { cartLineHref, cartLineImage, cartLineTitle, variantLabel } from "./cart-utils"

type CartItemInput = {
  id: string
  quantity: number
  product_title?: string | null
  title?: string | null
  thumbnail?: string | null
  subtotal?: number | null
  unit_price?: number | null
  variant_id?: string | null
  product?: {
    handle?: string | null
    metadata?: Record<string, unknown> | null
  } | null
  variant?: {
    id?: string | null
    title?: string | null
    sku?: string | null
    options?: { value?: string | null }[] | null
  } | null
}

export function CartItems({ items }: { items: CartItemInput[] }) {
  const lineItems: CartLineItemData[] = items.map((item) => {
    const title = cartLineTitle(item)
    const color = variantLabel(item)
    return {
      id: item.id,
      quantity: item.quantity,
      product_title: title,
      title,
      thumbnail: cartLineImage(item),
      subtotal: item.subtotal,
      unit_price: item.unit_price,
      productHref: cartLineHref(item),
      variant: color && !title.toLocaleLowerCase("tr").includes(color.toLocaleLowerCase("tr"))
        ? color
        : null,
    }
  })

  return (
    <ul className="cart-lines">
      {lineItems.map((item) => (
        <CartLineItem key={item.id} item={item} />
      ))}
    </ul>
  )
}
