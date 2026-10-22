'use client'

import Image from 'next/image'
import Link from 'next/link'
import { HeartIcon } from '@/components/icons'
import { useBag } from '@/features/bag/BagProvider'
import { formatTry } from '@/lib/format'
import { productPath } from '@/lib/site'
import type { ShopProductSummary } from '@/types/product'

export type GridView = 'grid' | 'list'

export default function ProductCard({
  product,
  view,
}: {
  product: ShopProductSummary
  view: GridView
}) {
  const { isFavorite, toggleFavorite, addToCart } = useBag()
  const favorited = isFavorite(product.id)

  if (view === 'list') {
    return (
      <article
        className={`group flex gap-5 border-b border-ink/8 py-6 sm:gap-8 ${
          product.inStock ? '' : 'opacity-70'
        }`}
      >
        <Link
          href={productPath(product.id)}
          className="relative aspect-square w-28 shrink-0 overflow-hidden bg-[#f3f3f3] sm:w-40"
        >
          <Image
            src={product.image}
            alt={product.name}
            width={320}
            height={320}
            className="h-full w-full object-cover"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <Link
            href={productPath(product.id)}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <h2 className="font-display text-[1.2rem] leading-tight font-bold tracking-wider text-ink uppercase sm:text-[1.4rem]">
              {product.name}
            </h2>
            <p className="mt-1 font-display text-sm tracking-wide text-ink/50 uppercase">
              {product.subtitle}
            </p>
          </Link>
          <p className="font-display text-[1.1rem] font-bold text-ink">
            {product.inStock ? formatTry(product.price) : 'Tükendi'}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!product.inStock}
              onClick={() => void addToCart(product.id)}
              className="bg-garden px-4 py-2.5 font-display text-[0.7rem] font-bold tracking-[0.12em] text-cream uppercase transition-colors hover:bg-garden-dark disabled:cursor-not-allowed disabled:bg-ink/20"
            >
              Sepete ekle
            </button>
            <button
              type="button"
              onClick={() => toggleFavorite(product.id)}
              aria-pressed={favorited}
              className={`inline-flex items-center gap-2 border px-4 py-2.5 font-display text-[0.7rem] font-bold tracking-[0.12em] uppercase transition-colors ${
                favorited
                  ? 'border-brand bg-brand/5 text-brand'
                  : 'border-ink/15 text-ink hover:border-ink/40'
              }`}
            >
              <HeartIcon filled={favorited} size={14} />
              {favorited ? 'Favoride' : 'Favoriye ekle'}
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className={`group ${product.inStock ? '' : 'opacity-70'}`}>
      <div className="relative aspect-[3/4] overflow-hidden bg-[#f3f3f3]">
        <Link
          href={productPath(product.id)}
          className="absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label={product.name}
        >
          <Image
            src={product.image}
            alt=""
            width={600}
            height={800}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </Link>

        {!product.inStock ? (
          <span className="pointer-events-none absolute top-3 left-3 z-10 bg-ink px-2.5 py-1 text-[0.65rem] font-bold tracking-wider text-cream uppercase">
            Tükendi
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => toggleFavorite(product.id)}
          aria-pressed={favorited}
          aria-label={favorited ? 'Favorilerden çıkar' : 'Favoriye ekle'}
          className={`absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-white ${
            favorited ? 'text-brand' : ''
          }`}
        >
          <HeartIcon filled={favorited} size={17} />
        </button>

        {product.inStock ? (
          <button
            type="button"
            onClick={() => void addToCart(product.id)}
            className="absolute right-3 bottom-3 left-3 z-10 translate-y-2 bg-ink px-3 py-2.5 font-display text-[0.75rem] font-bold tracking-[0.14em] text-cream uppercase opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100 max-sm:translate-y-0 max-sm:opacity-100"
          >
            Sepete ekle
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-1.5">
        <Link
          href={productPath(product.id)}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <h2 className="font-display text-[1.15rem] leading-[1.1] font-bold tracking-wider text-ink uppercase sm:text-[1.3rem]">
            {product.name}
          </h2>
          <p className="mt-1.5 font-display text-sm font-normal tracking-wide text-ink/50 uppercase">
            {product.subtitle}
          </p>
          <p className="pt-1.5 font-display text-[1.05rem] font-bold tracking-wide text-ink">
            {product.inStock ? formatTry(product.price) : 'Tükendi'}
          </p>
        </Link>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={!product.inStock}
            onClick={() => void addToCart(product.id)}
            className="flex-1 bg-garden px-3 py-2.5 font-display text-[0.7rem] font-bold tracking-[0.12em] text-cream uppercase transition-colors hover:bg-garden-dark disabled:cursor-not-allowed disabled:bg-ink/20 sm:hidden"
          >
            Sepete ekle
          </button>
          <button
            type="button"
            onClick={() => toggleFavorite(product.id)}
            aria-pressed={favorited}
            className={`inline-flex items-center justify-center border px-3 py-2.5 font-display text-[0.7rem] font-bold tracking-[0.12em] uppercase transition-colors sm:hidden ${
              favorited
                ? 'border-brand bg-brand/5 text-brand'
                : 'border-ink/15 text-ink hover:border-ink/40'
            }`}
          >
            {favorited ? 'Favoride' : 'Favori'}
          </button>
        </div>
      </div>
    </article>
  )
}
