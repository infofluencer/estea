import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ProductDetail from '@/components/product/ProductDetail'
import { getProductById, getRelatedProducts, listProducts, toSummary } from '@/server/catalog/repository'

export async function generateStaticParams() {
  const products = await listProducts()
  return products.map((product) => ({ id: product.id }))
}

export async function generateMetadata({ params }: PageProps<'/urunler/[id]'>): Promise<Metadata> {
  const { id } = await params
  const product = await getProductById(id)
  if (!product) return {}
  return {
    title: product.name,
    description: product.lead,
    openGraph: { images: [product.image] },
  }
}

export default async function ProductPage({ params }: PageProps<'/urunler/[id]'>) {
  const { id } = await params
  const product = await getProductById(id)
  if (!product) notFound()

  const related = await getRelatedProducts(product)

  return <ProductDetail product={product} related={related.map(toSummary)} />
}
