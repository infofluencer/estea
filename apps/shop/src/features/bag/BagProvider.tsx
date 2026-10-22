'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchBag, postAddToCart, postToggleFavorite } from './api'
import { emptyBag, MAX_LINE_QUANTITY, type Bag } from './types'

type BagContextValue = {
  bag: Bag
  toggleFavorite: (id: string) => void
  /** Resolves to false when the server rejected the item (e.g. out of stock). */
  addToCart: (id: string, quantity?: number) => Promise<boolean>
  isFavorite: (id: string) => boolean
  cartCount: number
  favoriteCount: number
}

const BagContext = createContext<BagContextValue | null>(null)

/**
 * Holds the visitor's cart and favorites. The server (cookie-backed /api/bag)
 * is the source of truth; local state is updated optimistically and then
 * replaced with the server's response.
 */
export function BagProvider({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState<Bag>(emptyBag)

  useEffect(() => {
    fetchBag().then(setBag, () => {})
  }, [])

  const resync = useCallback(() => {
    fetchBag().then(setBag, () => {})
  }, [])

  const toggleFavorite = useCallback(
    (id: string) => {
      setBag((prev) => ({
        ...prev,
        favorites: prev.favorites.includes(id)
          ? prev.favorites.filter((f) => f !== id)
          : [...prev.favorites, id],
      }))
      postToggleFavorite(id).then(setBag, resync)
    },
    [resync],
  )

  const addToCart = useCallback(
    async (id: string, quantity = 1) => {
      setBag((prev) => ({
        ...prev,
        cart: { ...prev.cart, [id]: Math.min(MAX_LINE_QUANTITY, (prev.cart[id] ?? 0) + quantity) },
      }))
      try {
        setBag(await postAddToCart(id, quantity))
        return true
      } catch {
        resync()
        return false
      }
    },
    [resync],
  )

  const value = useMemo<BagContextValue>(
    () => ({
      bag,
      toggleFavorite,
      addToCart,
      isFavorite: (id: string) => bag.favorites.includes(id),
      cartCount: Object.values(bag.cart).reduce((sum, n) => sum + n, 0),
      favoriteCount: bag.favorites.length,
    }),
    [bag, toggleFavorite, addToCart],
  )

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>
}

export function useBag() {
  const ctx = useContext(BagContext)
  if (!ctx) throw new Error('useBag must be used within BagProvider')
  return ctx
}
