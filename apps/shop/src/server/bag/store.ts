import 'server-only'
import { cookies } from 'next/headers'
import { emptyBag, type Bag } from '@/features/bag/types'

const COOKIE_NAME = 'estea_bag'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function parseBag(raw: string | undefined): Bag {
  if (!raw) return emptyBag
  try {
    const value = JSON.parse(raw) as Partial<Bag>
    const cart: Bag['cart'] = {}
    for (const [id, qty] of Object.entries(value.cart ?? {})) {
      if (typeof qty === 'number' && Number.isInteger(qty) && qty > 0) cart[id] = qty
    }
    const favorites = Array.isArray(value.favorites)
      ? value.favorites.filter((id): id is string => typeof id === 'string')
      : []
    return { cart, favorites }
  } catch {
    return emptyBag
  }
}

export async function readBag(): Promise<Bag> {
  const store = await cookies()
  return parseBag(store.get(COOKIE_NAME)?.value)
}

export async function writeBag(bag: Bag) {
  const store = await cookies()
  store.set(COOKIE_NAME, JSON.stringify(bag), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}
