import Image from 'next/image'
import Link from 'next/link'
import { formatTry } from '@/lib/format'
import { landingUrl, productsPath } from '@/lib/site'
import type { ShopProduct, ShopProductSummary } from '@/types/product'
import ProductPurchase from './ProductPurchase'
import RelatedProducts from './RelatedProducts'

export default function ProductDetail({
  product,
  related,
}: {
  product: ShopProduct
  related: ShopProductSummary[]
}) {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-5 pt-6 pb-20 sm:px-8 sm:pt-8 sm:pb-28">
        <nav className="mb-8 text-sm text-ink/45" aria-label="Sayfa yolu">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <a href={landingUrl} className="hover:text-ink">
                Ana Sayfa
              </a>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={productsPath} className="hover:text-ink">
                Çaylarımız
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li className="text-ink">{product.collection}</li>
          </ol>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[3/4] overflow-hidden bg-[#f3f3f3] sm:aspect-square lg:aspect-[4/5]">
            <Image
              src={product.image}
              alt={product.name}
              width={900}
              height={1125}
              priority
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

            <ProductPurchase productId={product.id} inStock={product.inStock} />

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

        <RelatedProducts products={related} />
      </div>
    </div>
  )
}
