import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ShopBagContextValue = {
  favorites: Set<string>
  cart: Map<string, number>
  toggleFavorite: (id: string) => void
  addToCart: (id: string) => void
  isFavorite: (id: string) => boolean
  cartCount: number
  favoriteCount: number
}

const ShopBagContext = createContext<ShopBagContextValue | null>(null)

export function ShopBagProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [cart, setCart] = useState<Map<string, number>>(() => new Map())

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const addToCart = useCallback((id: string) => {
    setCart((prev) => {
      const next = new Map(prev)
      next.set(id, (next.get(id) || 0) + 1)
      return next
    })
  }, [])

  const value = useMemo<ShopBagContextValue>(
    () => ({
      favorites,
      cart,
      toggleFavorite,
      addToCart,
      isFavorite: (id: string) => favorites.has(id),
      cartCount: [...cart.values()].reduce((sum, n) => sum + n, 0),
      favoriteCount: favorites.size,
    }),
    [favorites, cart, toggleFavorite, addToCart],
  )

  return <ShopBagContext.Provider value={value}>{children}</ShopBagContext.Provider>
}

export function useShopBag() {
  const ctx = useContext(ShopBagContext)
  if (!ctx) throw new Error('useShopBag must be used within ShopBagProvider')
  return ctx
}
