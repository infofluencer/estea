import 'server-only'
import type { ShopProduct, ShopProductSummary } from '@/types/product'
import { shopProducts } from './products.data'

/**
 * Catalog access for pages and API routes. Backed by static data today;
 * swap the implementations here to move to a database without touching callers.
 */

export async function listProducts(): Promise<ShopProduct[]> {
  return shopProducts
}

export async function getProductById(id: string): Promise<ShopProduct | undefined> {
  return shopProducts.find((p) => p.id === id)
}

export async function getRelatedProducts(product: ShopProduct, limit = 4): Promise<ShopProduct[]> {
  return shopProducts
    .filter((p) => p.id !== product.id && p.collection === product.collection)
    .concat(shopProducts.filter((p) => p.id !== product.id && p.collection !== product.collection))
    .slice(0, limit)
}

export function toSummary(product: ShopProduct): ShopProductSummary {
  const { id, name, subtitle, collection, price, image, inStock } = product
  return { id, name, subtitle, collection, price, image, inStock }
}
