import { permanentRedirect } from "next/navigation"
import { listingPath } from "@/lib/urls"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Eski /categories?category=… adresi → /urun-kategori/… (bileşenler bu klasörde kalır). */
export default async function LegacyCategoriesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && k !== "category" && k !== "collection") query.set(k, v)
  }
  permanentRedirect(
    listingPath(
      {
        category: typeof sp.category === "string" ? sp.category : undefined,
        collection: typeof sp.collection === "string" ? sp.collection : undefined,
      },
      query
    )
  )
}
