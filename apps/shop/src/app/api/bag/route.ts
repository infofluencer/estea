import { NextResponse } from 'next/server'
import { getBag } from '@/server/bag/service'

export async function GET() {
  return NextResponse.json(await getBag())
}
