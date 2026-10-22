'use client'

import { useMemo, useState } from 'react'
import type { ShopProductSummary } from '@/types/product'
import ProductCard, { type GridView } from './ProductCard'

type SortKey = 'default' | 'price-asc' | 'price-desc' | 'name'

export default function ProductCatalog({ products: allProducts }: { products: ShopProductSummary[] }) {
  const [sort, setSort] = useState<SortKey>('default')
  const [view, setView] = useState<GridView>('grid')
  const total = allProducts.length

  const products = useMemo(() => {
    const list = [...allProducts]
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    return list
  }, [allProducts, sort])

  return (
    <>
      <div className="mt-10 flex flex-col gap-4 border-y border-ink/10 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink/55">
          {total} sonuçtan 1–{products.length} arası gösteriliyor
        </p>

        <div className="flex flex-wrap items-center gap-4 sm:gap-5">
          <label className="relative inline-flex items-center">
            <span className="sr-only">Sıralama</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none border border-ink/15 bg-white py-2 pr-9 pl-3 text-sm text-ink outline-none focus:border-garden"
            >
              <option value="default">Varsayılan Sıralama</option>
              <option value="price-asc">Fiyat: Düşükten yükseğe</option>
              <option value="price-desc">Fiyat: Yüksekten düşüğe</option>
              <option value="name">İsme göre</option>
            </select>
            <svg
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink/50"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-sm text-ink/55">Görünüm</span>
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              aria-label="Izgara görünüm"
              className={`p-1.5 ${view === 'grid' ? 'text-garden' : 'text-ink/30'}`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
                <rect x="1" y="1" width="7" height="7" rx="0.5" />
                <rect x="10" y="1" width="7" height="7" rx="0.5" />
                <rect x="1" y="10" width="7" height="7" rx="0.5" />
                <rect x="10" y="10" width="7" height="7" rx="0.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              aria-label="Liste görünüm"
              className={`p-1.5 ${view === 'list' ? 'text-garden' : 'text-ink/30'}`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
                <rect x="1" y="2" width="16" height="2.5" rx="0.5" />
                <rect x="1" y="7.75" width="16" height="2.5" rx="0.5" />
                <rect x="1" y="13.5" width="16" height="2.5" rx="0.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-12 sm:gap-x-6 sm:gap-y-14 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} view="grid" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} view="list" />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
