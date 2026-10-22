export type Bag = {
  /** productId → quantity */
  cart: Record<string, number>
  favorites: string[]
}

export const emptyBag: Bag = { cart: {}, favorites: [] }

export const MAX_LINE_QUANTITY = 99
