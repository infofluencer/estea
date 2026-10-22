"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import {
  addWishlistAction,
  listWishlistAction,
  removeWishlistAction,
  syncWishlistAction,
} from "@/lib/auth/wishlist-actions"
import {
  FAVORITE_ADDED_EVENT,
  readFavorites,
  toWishlistInput,
  toggleFavoriteLocal,
  writeFavorites,
  type FavoriteAddedPayload,
  type FavoriteProduct,
} from "@/lib/favorites"

type FavoritesContextValue = {
  items: FavoriteProduct[]
  isLoggedIn: boolean
  pending: boolean
  isFavorite: (productId: string) => boolean
  toggleFavorite: (product: FavoriteProduct) => void
  refresh: () => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({
  isLoggedIn,
  children,
}: {
  isLoggedIn: boolean
  children: ReactNode
}) {
  const [items, setItems] = useState<FavoriteProduct[]>([])
  const [pending, startTransition] = useTransition()
  const [hydrated, setHydrated] = useState(false)

  const applyItems = useCallback((next: FavoriteProduct[]) => {
    setItems(next)
    writeFavorites(next)
  }, [])

  const refreshFromLocal = useCallback(() => {
    setItems(readFavorites())
  }, [])

  useEffect(() => {
    refreshFromLocal()
    setHydrated(true)

    function onLocal() {
      setItems(readFavorites())
    }
    window.addEventListener("escay:favorites", onLocal)
    window.addEventListener("storage", onLocal)
    return () => {
      window.removeEventListener("escay:favorites", onLocal)
      window.removeEventListener("storage", onLocal)
    }
  }, [refreshFromLocal])

  // Logged-in: merge browser favorites → account wishlist, then use server list.
  useEffect(() => {
    if (!hydrated) return

    if (!isLoggedIn) {
      // Guest session: localStorage is the source of truth.
      refreshFromLocal()
      return
    }

    let cancelled = false
    startTransition(async () => {
      const local = readFavorites()
      const result =
        local.length > 0
          ? await syncWishlistAction(local.map(toWishlistInput))
          : await listWishlistAction()

      if (cancelled || !result.ok) return
      applyItems(result.items)
    })

    return () => {
      cancelled = true
    }
  }, [hydrated, isLoggedIn, applyItems, refreshFromLocal])

  const toggleFavorite = useCallback(
    (product: FavoriteProduct) => {
      if (!isLoggedIn) {
        toggleFavoriteLocal(product)
        setItems(readFavorites())
        return
      }

      const exists = items.some((f) => f.id === product.id)
      const optimistic = exists
        ? items.filter((f) => f.id !== product.id)
        : [...items, product]
      applyItems(optimistic)

      if (!exists) {
        window.dispatchEvent(
          new CustomEvent<FavoriteAddedPayload>(FAVORITE_ADDED_EVENT, {
            detail: {
              title: product.title,
              image: product.image,
              price: product.price,
            },
          })
        )
      }

      startTransition(async () => {
        const result = exists
          ? await removeWishlistAction(product.id)
          : await addWishlistAction(toWishlistInput(product))
        if (!result.ok) {
          // Revert optimistic update from server list when possible
          const listed = await listWishlistAction()
          if (listed.ok) applyItems(listed.items)
          return
        }
        if (result.items) applyItems(result.items)
      })
    },
    [isLoggedIn, items, applyItems]
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({
      items,
      isLoggedIn,
      pending,
      isFavorite: (productId: string) =>
        hydrated && items.some((f) => f.id === productId),
      toggleFavorite,
      refresh: () => {
        if (!isLoggedIn) {
          refreshFromLocal()
          return
        }
        startTransition(async () => {
          const listed = await listWishlistAction()
          if (listed.ok) applyItems(listed.items)
        })
      },
    }),
    [
      items,
      isLoggedIn,
      pending,
      hydrated,
      toggleFavorite,
      refreshFromLocal,
      applyItems,
    ]
  )

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) {
    // Fallback for pages outside provider (should be rare)
    return {
      items: [],
      isLoggedIn: false,
      pending: false,
      isFavorite: () => false,
      toggleFavorite: (product: FavoriteProduct) => {
        toggleFavoriteLocal(product)
      },
      refresh: () => {},
    } satisfies FavoritesContextValue
  }
  return ctx
}
