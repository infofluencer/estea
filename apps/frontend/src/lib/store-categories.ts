import { unstable_cache } from "next/cache"
import { PRODUCT_IMAGE, sdk } from "@/lib/medusa"

export type StoreCategory = {
  id: string
  handle: string
  name: string
  /** Kategorideki yayınlanmış ürün sayısı. */
  count: number
  /** Kart görseli: kategorinin ilk ürününün paket fotoğrafı. */
  image: string
}

/** Vitrin kategorileri değil, menüde ve ana sayfada görünen üst kategoriler (seed sırası). */
const ORDER = ["siyah-cay", "yesil-cay", "bitki-cayi", "harmanlar", "hediye", "seker"]

async function loadStoreCategories(): Promise<StoreCategory[]> {
  const [{ product_categories }, { products }] = await Promise.all([
    sdk.store.category.list({
      limit: 50,
      fields: "id,handle,name,rank,parent_category_id",
    }),
    sdk.store.product.list({
      limit: 200,
      fields: "id,thumbnail,*categories",
      order: "created_at",
    }),
  ])

  const counts = new Map<string, number>()
  const images = new Map<string, string>()
  for (const p of products) {
    for (const c of p.categories || []) {
      counts.set(c.id, (counts.get(c.id) || 0) + 1)
      if (!images.has(c.id) && p.thumbnail) images.set(c.id, p.thumbnail)
    }
  }

  return product_categories
    .filter((c) => !c.parent_category_id)
    .map((c) => ({
      id: c.id,
      handle: c.handle,
      name: c.name,
      count: counts.get(c.id) || 0,
      image: images.get(c.id) || PRODUCT_IMAGE,
    }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.handle)
      const ib = ORDER.indexOf(b.handle)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
}

const cached = unstable_cache(loadStoreCategories, ["store-categories"], {
  revalidate: 300,
})

/** Ürünü olan üst kategoriler; boş kategori (ör. henüz ürünsüz Hediye) menüde çıkmaz. */
export async function getStoreCategories(): Promise<StoreCategory[]> {
  try {
    return (await cached()).filter((c) => c.count > 0)
  } catch {
    return []
  }
}
