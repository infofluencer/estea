export type ShopProduct = {
  id: string
  name: string
  subtitle: string
  collection: string
  price: number
  image: string
  href: string
  inStock: boolean
  sku: string
  stockLabel: string
  lead: string
  bullets: string[]
  description: string[]
}

export type ShopProductSummary = Pick<
  ShopProduct,
  'id' | 'name' | 'subtitle' | 'collection' | 'price' | 'image' | 'inStock'
>
