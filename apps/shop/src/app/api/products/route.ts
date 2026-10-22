import { NextResponse } from 'next/server'
import { listProducts, toSummary } from '@/server/catalog/repository'

export async function GET() {
  const products = await listProducts()
  return NextResponse.json({ products: products.map(toSummary) })
}
