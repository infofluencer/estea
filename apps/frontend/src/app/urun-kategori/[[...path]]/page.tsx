import { redirect } from "next/navigation"
import { Suspense } from "react"
import { CategoriesProductSection } from "@/app/categories/CategoriesProductSection"
import CategoriesLoading from "@/app/categories/CategoriesLoading"
import { listingFromSegments, listingPath } from "@/lib/urls"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{
  color?: string
  sort?: string
  q?: string
}>

/** Listeleme yolları: /urun-kategori, /urun-kategori/siyah-cay, /urun-kategori/koleksiyon/{handle} */
export default async function CategoryListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>
  searchParams: SearchParams
}) {
  // Eski /urun-kategori/koleksiyon adresi (koleksiyon seçilmemiş) → tüm çaylar.
  // Suspense'ten önce: gerçek HTTP yönlendirmesi (tarayıcı dışı istemciler için).
  const { path } = await params
  if (path?.length === 1 && path[0] === "koleksiyon") {
    const sp = await searchParams
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") query.set(k, v)
    redirect(listingPath({}, query))
  }
  return (
    <Suspense fallback={<CategoriesLoading />}>
      <CategoryListingContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function CategoryListingContent({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>
  searchParams: SearchParams
}) {
  const [{ path }, sp] = await Promise.all([params, searchParams])
  const filter = listingFromSegments((path || []).map(decodeURIComponent))
  return (
    <CategoriesProductSection
      searchParams={{ color: sp.color, sort: sp.sort, q: sp.q, ...filter }}
    />
  )
}
