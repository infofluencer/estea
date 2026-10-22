import 'server-only'
import { getProductById } from '@/server/catalog/repository'
import { MAX_LINE_QUANTITY, type Bag } from '@/features/bag/types'
import { readBag, writeBag } from './store'

export class BagError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function getBag(): Promise<Bag> {
  return readBag()
}

export async function addToCart(productId: string, quantity: number): Promise<Bag> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new BagError('Geçersiz adet', 400)
  }

  const product = await getProductById(productId)
  if (!product) throw new BagError('Ürün bulunamadı', 404)
  if (!product.inStock) throw new BagError('Ürün stokta yok', 409)

  const bag = await readBag()
  const current = bag.cart[productId] ?? 0
  const next: Bag = {
    ...bag,
    cart: { ...bag.cart, [productId]: Math.min(MAX_LINE_QUANTITY, current + quantity) },
  }
  await writeBag(next)
  return next
}

export async function toggleFavorite(productId: string): Promise<Bag> {
  const product = await getProductById(productId)
  if (!product) throw new BagError('Ürün bulunamadı', 404)

  const bag = await readBag()
  const favorites = bag.favorites.includes(productId)
    ? bag.favorites.filter((id) => id !== productId)
    : [...bag.favorites, productId]
  const next: Bag = { ...bag, favorites }
  await writeBag(next)
  return next
}
