import { permanentRedirect } from "next/navigation"
import { productPath } from "@/lib/urls"

/** Eski /products/{handle} adresi → /urun/{handle} (mail, Omnisend, eski linkler). */
export default async function LegacyProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { handle } = await params
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === "string") query.set(k, v)
  }
  permanentRedirect(productPath(handle, query))
}
