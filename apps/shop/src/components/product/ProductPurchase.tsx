'use client'

import { useState } from 'react'
import { HeartIcon } from '@/components/icons'
import { useBag } from '@/features/bag/BagProvider'
import { MAX_LINE_QUANTITY } from '@/features/bag/types'

export default function ProductPurchase({
  productId,
  inStock,
}: {
  productId: string
  inStock: boolean
}) {
  const { isFavorite, toggleFavorite, addToCart } = useBag()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [pending, setPending] = useState(false)
  const favorited = isFavorite(productId)

  async function handleAdd() {
    if (!inStock || pending) return
    setPending(true)
    const ok = await addToCart(productId, qty)
    setPending(false)
    if (!ok) return
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center border border-ink/15">
        <button
          type="button"
          aria-label="Adedi azalt"
          disabled={qty <= 1}
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="h-12 w-11 text-lg text-ink disabled:opacity-30"
        >
          −
        </button>
        <span className="min-w-10 text-center font-display text-lg font-bold">{qty}</span>
        <button
          type="button"
          aria-label="Adedi artır"
          disabled={qty >= MAX_LINE_QUANTITY}
          onClick={() => setQty((q) => Math.min(MAX_LINE_QUANTITY, q + 1))}
          className="h-12 w-11 text-lg text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>

      <button
        type="button"
        disabled={!inStock || pending}
        onClick={handleAdd}
        className="min-h-12 flex-1 bg-garden px-6 font-display text-[0.8rem] font-bold tracking-[0.16em] text-cream uppercase transition-colors hover:bg-garden-dark disabled:cursor-not-allowed disabled:bg-ink/20 sm:flex-none sm:min-w-[12rem]"
      >
        {added ? 'Eklendi' : 'Sepete ekle'}
      </button>

      <button
        type="button"
        onClick={() => toggleFavorite(productId)}
        aria-pressed={favorited}
        aria-label={favorited ? 'Favorilerden çıkar' : 'Favoriye ekle'}
        className={`inline-flex h-12 w-12 items-center justify-center border transition-colors ${
          favorited
            ? 'border-brand bg-brand/5 text-brand'
            : 'border-ink/15 text-ink hover:border-ink/40'
        }`}
      >
        <HeartIcon filled={favorited} />
      </button>
    </div>
  )
}
