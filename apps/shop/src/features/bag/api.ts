import type { Bag } from './types'

async function request(path: string, init?: RequestInit): Promise<Bag> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `İstek başarısız (${res.status})`)
  }
  return res.json() as Promise<Bag>
}

export function fetchBag() {
  return request('/api/bag', { cache: 'no-store' })
}

export function postAddToCart(productId: string, quantity: number) {
  return request('/api/bag/cart', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  })
}

export function postToggleFavorite(productId: string) {
  return request('/api/bag/favorites', {
    method: 'POST',
    body: JSON.stringify({ productId }),
  })
}
