import { NextResponse } from 'next/server'
import { jsonError, readJson } from '@/lib/http'
import { BagError, toggleFavorite } from '@/server/bag/service'

export async function POST(request: Request) {
  const body = await readJson<{ productId: string }>(request)
  if (!body || typeof body.productId !== 'string') return jsonError('productId gerekli', 400)

  try {
    return NextResponse.json(await toggleFavorite(body.productId))
  } catch (error) {
    if (error instanceof BagError) return jsonError(error.message, error.status)
    throw error
  }
}
