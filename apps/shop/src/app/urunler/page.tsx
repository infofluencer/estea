import type { Metadata } from 'next'
import ProductCatalog from '@/components/product/ProductCatalog'
import { listProducts, toSummary } from '@/server/catalog/repository'

export const metadata: Metadata = {
  title: 'Çaylarımız',
}

export default async function ProductsPage() {
  const products = await listProducts()

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

        <ProductCatalog products={products.map(toSummary)} />
      </div>
    </div>
  )
}
