import { NextResponse } from 'next/server'
import { jsonError } from '@/lib/http'
import { getProductById } from '@/server/catalog/repository'

export async function GET(_request: Request, { params }: RouteContext<'/api/products/[id]'>) {
  const { id } = await params
  const product = await getProductById(id)
  if (!product) return jsonError('Ürün bulunamadı', 404)
  return NextResponse.json({ product })
}
