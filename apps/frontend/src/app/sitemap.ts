import type { MetadataRoute } from "next"
import { sdk } from "@/lib/medusa"
import { siteUrl } from "@/lib/site"
import { categoryPath, collectionPath, productPath } from "@/lib/urls"

export const dynamic = "force-dynamic"
export const revalidate = 3600

const STATIC_PATHS = [
  "",
  "/urun-kategori",
  "/hakkimizda",
  "/iletisim",
  "/faq",
  "/gizlilik-politikasi",
  "/cerez-politikasi",
  "/iade-ve-geri-odeme-politikasi",
  "/legal/mesafeli-satis-sozlesmesi",
  "/legal/on-bilgilendirme-formu",
  "/legal/teslimat-ve-kargo",
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === "" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }))

  try {
    const { products } = await sdk.store.product.list({
      limit: 500,
      fields: "handle,updated_at",
    })
    for (const p of products) {
      if (!p.handle) continue
      entries.push({
        url: `${base}${productPath(p.handle)}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      })
    }
  } catch {
    // Backend erişilemezse statik sayfalarla dön
  }

  try {
    const { product_categories } = await sdk.store.category.list({
      limit: 200,
      fields: "handle",
    })
    for (const c of product_categories) {
      entries.push({
        url: `${base}${categoryPath(c.handle)}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  } catch {
    /* ignore */
  }

  try {
    const { collections } = await sdk.store.collection.list({
      limit: 100,
      fields: "handle",
    })
    for (const c of collections) {
      entries.push({
        url: `${base}${collectionPath(c.handle)}`,
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
  } catch {
    /* ignore */
  }

  return entries
}
