import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import {
  formatTry,
  getProductById,
  getRelatedProducts,
} from '../../data/products'
import { useShopBag } from './ShopBagContext'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const product = id ? getProductById(id) : undefined
  const { isFavorite, toggleFavorite, addToCart } = useShopBag()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-24 text-center sm:px-8">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
          Ürün bulunamadı
        </h1>
        <Link
          to="/urunler"
          className="mt-6 inline-block font-display text-sm font-bold tracking-wider text-garden uppercase underline-offset-4 hover:underline"
        >
          Çaylarımıza dön
        </Link>
      </div>
    )
  }

  const favorited = isFavorite(product.id)
  const related = getRelatedProducts(product)

  function handleAdd() {
    if (!product || !product.inStock) return
    for (let i = 0; i < qty; i += 1) addToCart(product.id)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-5 pt-6 pb-20 sm:px-8 sm:pt-8 sm:pb-28">
        <nav className="mb-8 text-sm text-ink/45" aria-label="Sayfa yolu">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link to="/" className="hover:text-ink">
                Ana Sayfa
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link to="/urunler" className="hover:text-ink">
                Çaylarımız
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-ink">{product.collection}</li>
          </ol>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[3/4] overflow-hidden bg-[#f3f3f3] sm:aspect-square lg:aspect-[4/5]">
            <img
              src={product.image}
              alt={product.name}
              width={900}
              height={1125}
              className="h-full w-full object-cover"
            />
            {!product.inStock ? (
              <span className="absolute top-4 left-4 bg-ink px-3 py-1.5 text-[0.7rem] font-bold tracking-wider text-cream uppercase">
                Tükendi
              </span>
            ) : null}
          </div>

          <div className="flex flex-col lg:pt-4">
            <p className="font-display text-sm tracking-[0.16em] text-garden uppercase">
              {product.collection}
            </p>
            <h1 className="mt-2 font-display text-[2.2rem] leading-[0.95] font-bold tracking-wide text-ink uppercase sm:text-[3rem] lg:text-[3.4rem]">
              {product.name}
            </h1>

            <p className="mt-5 font-display text-[1.6rem] font-bold tracking-wide text-ink sm:text-[1.85rem]">
              {formatTry(product.price)}
            </p>

            <p className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-ink/65 sm:text-base">
              {product.lead}
            </p>

            <ul className="mt-5 space-y-2 text-sm text-ink/70 sm:text-[0.95rem]">
              {product.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-garden" aria-hidden />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <p
              className={`mt-5 text-sm font-medium ${
                product.inStock ? 'text-garden' : 'text-brand'
              }`}
            >
              {product.stockLabel}
            </p>

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
                  onClick={() => setQty((q) => q + 1)}
                  className="h-12 w-11 text-lg text-ink"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                disabled={!product.inStock}
                onClick={handleAdd}
                className="min-h-12 flex-1 bg-garden px-6 font-display text-[0.8rem] font-bold tracking-[0.16em] text-cream uppercase transition-colors hover:bg-[#244028] disabled:cursor-not-allowed disabled:bg-ink/20 sm:flex-none sm:min-w-[12rem]"
              >
                {added ? 'Eklendi' : 'Sepete ekle'}
              </button>

              <button
                type="button"
                onClick={() => toggleFavorite(product.id)}
                aria-pressed={favorited}
                aria-label={favorited ? 'Favorilerden çıkar' : 'Favoriye ekle'}
                className={`inline-flex h-12 w-12 items-center justify-center border transition-colors ${
                  favorited
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-ink/15 text-ink hover:border-ink/40'
                }`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={favorited ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>

            <dl className="mt-8 space-y-2 border-t border-ink/10 pt-6 text-sm text-ink/55">
              <div className="flex gap-2">
                <dt className="font-medium text-ink/70">Ürün kodu:</dt>
                <dd>{product.sku}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-ink/70">Kategori:</dt>
                <dd>{product.collection}</dd>
              </div>
            </dl>
          </div>
        </div>

        <section className="mt-16 border-t border-ink/10 pt-12 sm:mt-20">
          <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
            Ürün açıklaması
          </h2>
          <div className="mt-5 max-w-3xl space-y-4 text-[0.95rem] leading-relaxed text-ink/65 sm:text-base">
            {product.description.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </section>

        {related.length > 0 ? (
          <section className="mt-16 sm:mt-20">
            <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
              Benzer ürünler
            </h2>
            <ul className="mt-8 grid grid-cols-2 gap-5 sm:gap-6 md:grid-cols-4">
              {related.map((item) => (
                <li key={item.id}>
                  <Link to={`/urunler/${item.id}`} className="group block">
                    <div className="aspect-[3/4] overflow-hidden bg-[#f3f3f3]">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                    <h3 className="mt-3 font-display text-[0.95rem] font-bold tracking-wider text-ink uppercase sm:text-[1.05rem]">
                      {item.name}
                    </h3>
                    <p className="mt-1 font-display text-sm font-bold text-ink">
                      {formatTry(item.price)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}
