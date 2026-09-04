import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatTry, shopProducts, type ShopProduct } from '../../data/products'
import { useShopBag } from './ShopBagContext'

type GridView = 'grid' | 'list'
type SortKey = 'default' | 'price-asc' | 'price-desc' | 'name'

function ProductCard({
  product,
  view,
}: {
  product: ShopProduct
  view: GridView
}) {
  const { isFavorite, toggleFavorite, addToCart } = useShopBag()
  const favorited = isFavorite(product.id)

  if (view === 'list') {
    return (
      <article
        className={`group flex gap-5 border-b border-ink/8 py-6 sm:gap-8 ${
          product.inStock ? '' : 'opacity-70'
        }`}
      >
        <Link
          to={`/urunler/${product.id}`}
          className="relative aspect-square w-28 shrink-0 overflow-hidden bg-[#f3f3f3] sm:w-40"
        >
          <img
            src={product.image}
            alt={product.name}
            width={320}
            height={320}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <Link
            to={`/urunler/${product.id}`}
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
              onClick={() => addToCart(product.id)}
              className="bg-garden px-4 py-2.5 font-display text-[0.7rem] font-bold tracking-[0.12em] text-cream uppercase transition-colors hover:bg-[#244028] disabled:cursor-not-allowed disabled:bg-ink/20"
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={favorited ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
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
          to={`/urunler/${product.id}`}
          className="absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label={product.name}
        >
          <img
            src={product.image}
            alt=""
            width={600}
            height={800}
            loading="lazy"
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
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill={favorited ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {product.inStock ? (
          <button
            type="button"
            onClick={() => addToCart(product.id)}
            className="absolute right-3 bottom-3 left-3 z-10 translate-y-2 bg-ink px-3 py-2.5 font-display text-[0.75rem] font-bold tracking-[0.14em] text-cream uppercase opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100 max-sm:translate-y-0 max-sm:opacity-100"
          >
            Sepete ekle
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-1.5">
        <Link
          to={`/urunler/${product.id}`}
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
            onClick={() => addToCart(product.id)}
            className="flex-1 bg-garden px-3 py-2.5 font-display text-[0.7rem] font-bold tracking-[0.12em] text-cream uppercase transition-colors hover:bg-[#244028] disabled:cursor-not-allowed disabled:bg-ink/20 sm:hidden"
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

export default function ShopProductsPage() {
  const [sort, setSort] = useState<SortKey>('default')
  const [view, setView] = useState<GridView>('grid')
  const total = shopProducts.length

  const products = useMemo(() => {
    const list = [...shopProducts]
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    return list
  }, [sort])

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-5 pt-10 pb-20 sm:px-8 sm:pt-14 sm:pb-28">
        <h1 className="font-display text-[2.6rem] leading-none font-bold tracking-wide text-ink uppercase sm:text-[3.4rem] lg:text-[4rem]">
          Çaylarımız
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink/60 sm:text-base">
          Rize ve Artvin yaylalarından özenle toplanan yapraklar. Harmanlar,
          gramajlar ve demlik süzen seçenekleri.
        </p>

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
      </div>
    </div>
  )
}
