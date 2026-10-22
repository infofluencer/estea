import { NextResponse } from 'next/server'

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/** Parses a JSON request body, returning null when it is missing or malformed. */
export async function readJson<T>(request: Request): Promise<Partial<T> | null> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' ? (body as Partial<T>) : null
  } catch {
    return null
  }
}
