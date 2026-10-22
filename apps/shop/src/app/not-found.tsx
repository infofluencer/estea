import Link from 'next/link'
import { productsPath } from '@/lib/site'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-24 text-center sm:px-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
        Ürün bulunamadı
      </h1>
      <Link
        href={productsPath}
        className="mt-6 inline-block font-display text-sm font-bold tracking-wider text-garden uppercase underline-offset-4 hover:underline"
      >
        Çaylarımıza dön
      </Link>
    </div>
  )
}
