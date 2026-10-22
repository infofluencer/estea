import { NextResponse } from 'next/server'
import { jsonError, readJson } from '@/lib/http'
import { addToCart, BagError } from '@/server/bag/service'

export async function POST(request: Request) {
  const body = await readJson<{ productId: string; quantity: number }>(request)
  if (!body || typeof body.productId !== 'string') return jsonError('productId gerekli', 400)

  try {
    return NextResponse.json(await addToCart(body.productId, body.quantity ?? 1))
  } catch (error) {
    if (error instanceof BagError) return jsonError(error.message, error.status)
    throw error
  }
}
