import Image from 'next/image'
import Link from 'next/link'
import { formatTry } from '@/lib/format'
import { productPath } from '@/lib/site'
import type { ShopProductSummary } from '@/types/product'

export default function RelatedProducts({ products }: { products: ShopProductSummary[] }) {
  if (products.length === 0) return null

  return (
    <section className="mt-16 sm:mt-20">
      <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
        Benzer ürünler
      </h2>
      <ul className="mt-8 grid grid-cols-2 gap-5 sm:gap-6 md:grid-cols-4">
        {products.map((item) => (
          <li key={item.id}>
            <Link href={productPath(item.id)} className="group block">
              <div className="aspect-[3/4] overflow-hidden bg-[#f3f3f3]">
                <Image
                  src={item.image}
                  alt={item.name}
                  width={600}
                  height={800}
                  sizes="(min-width: 768px) 25vw, 50vw"
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
  )
}
