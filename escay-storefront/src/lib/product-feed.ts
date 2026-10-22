/**
 * Google Merchant Center + Meta katalog XML feed'leri (RSS 2.0, `g:` namespace).
 *
 *   g:id            = varyant SKU (yoksa Medusa varyant id)
 *   g:item_group_id = Medusa ürün id (tek varyantlı üründe de yazılır)
 * Analytics item id'si (lib/analytics.ts) varyant id'dir; Meta dinamik reklamlar
 * için g:id ile eşleşsin diye SKU girilen ürünlerde SKU = varyant id değil —
 * Pixel/CAPI eşleşmesi gerekiyorsa SKU'suz bırakın ya da Meta'da eşleştirme kuralı tanımlayın.
 *
 * Yollar: /feeds/google.xml, /feeds/meta.xml (cache 1800 sn).
 */
import { sdk, storePricingParams, variantOriginalAmount, variantPriceAmount } from "@/lib/medusa"
import { COMPANY } from "@/lib/company"
import { siteUrl } from "@/lib/site"
import { isVariantInStock } from "@/lib/stock"
import { productPath } from "@/lib/urls"

export type FeedChannel = "google" | "meta"

export const FEEDS: Record<FeedChannel, { title: string; utm: Record<string, string> }> = {
  google: {
    title: `${COMPANY.brand} — Google Shopping`,
    utm: { utm_source: "google", utm_medium: "cpc", utm_campaign: "shopping" },
  },
  meta: {
    title: `${COMPANY.brand} — Katalog`,
    utm: { utm_source: "meta", utm_medium: "cpc", utm_campaign: "catalog" },
  },
}

/** Google ürün taksonomisi: Food, Beverages & Tobacco > Beverages > Tea & Infusions = 2073 */
const GOOGLE_PRODUCT_CATEGORY = "2073"
/** Meta: Food & beverages > Beverages */
const FB_PRODUCT_CATEGORY = "Food & beverages > Beverages"

type FeedVariant = {
  id: string
  title: string | null
  sku?: string | null
  metadata?: Record<string, unknown> | null
  inventory_quantity?: number | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  calculated_price?: Parameters<typeof variantPriceAmount>[0]
}

type FeedProduct = {
  id: string
  handle: string
  title: string
  description?: string | null
  thumbnail?: string | null
  images?: { url: string }[] | null
  metadata?: Record<string, unknown> | null
  categories?: { name: string }[] | null
  collection?: { title: string } | null
  variants?: FeedVariant[] | null
}

function xml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`
}

function money(n: number): string {
  return `${n.toFixed(2)} TRY`
}

function plainText(s?: string | null): string {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

async function loadProducts(): Promise<FeedProduct[]> {
  const out: FeedProduct[] = []
  const limit = 100
  for (let offset = 0; offset < 2000; offset += limit) {
    const { products, count } = await sdk.store.product.list({
      limit,
      offset,
      ...storePricingParams(),
      fields:
        "id,handle,title,description,thumbnail,*images,+metadata,*categories,*collection," +
        "*variants.calculated_price,+variants.title,+variants.sku,+variants.metadata," +
        "+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder",
    })
    out.push(...(products as unknown as FeedProduct[]))
    if (offset + limit >= (count ?? 0)) break
  }
  return out
}

export async function renderProductFeed(channel: FeedChannel): Promise<string> {
  const feed = FEEDS[channel]
  const base = siteUrl()
  const products = await loadProducts()
  const items: string[] = []

  for (const p of products) {
    const meta = p.metadata || {}
    const description = plainText(
      (typeof meta.seo_description === "string" && meta.seo_description) || p.description
    )
    const productType = ["Çay", p.categories?.[0]?.name || p.collection?.title || null]
      .filter(Boolean)
      .join(" > ")
    const image = p.thumbnail || p.images?.[0]?.url || null

    for (const v of p.variants || []) {
      const price = variantPriceAmount(v.calculated_price)
      if (price == null) continue
      const original = variantOriginalAmount(v.calculated_price) ?? price
      const id = (v.sku && v.sku.trim()) || v.id
      const variantLabel =
        v.title && !/^(default|standart|tek)/i.test(v.title) ? v.title : null
      const params = new URLSearchParams({ v: v.id, ...feed.utm })
      const link = `${base}${productPath(p.handle, params)}`
      const inStock = isVariantInStock(v)
      const title = variantLabel ? `${p.title} ${variantLabel}` : p.title

      const fields: string[] = [
        `<g:id>${xml(id)}</g:id>`,
        `<g:title>${xml(title)}</g:title>`,
        `<g:description>${cdata(description || p.title)}</g:description>`,
        `<g:link>${xml(link)}</g:link>`,
        image ? `<g:image_link>${xml(image)}</g:image_link>` : "",
        `<g:availability>${
          channel === "google"
            ? inStock ? "in_stock" : "out_of_stock"
            : inStock ? "in stock" : "out of stock"
        }</g:availability>`,
        `<g:price>${money(original)}</g:price>`,
        price < original ? `<g:sale_price>${money(price)}</g:sale_price>` : "",
        `<g:condition>new</g:condition>`,
        `<g:brand>${xml(COMPANY.brand)}</g:brand>`,
        `<g:item_group_id>${xml(p.id)}</g:item_group_id>`,
        variantLabel ? `<g:size>${xml(variantLabel)}</g:size>` : "",
        `<g:identifier_exists>no</g:identifier_exists>`,
        channel === "google"
          ? `<g:google_product_category>${GOOGLE_PRODUCT_CATEGORY}</g:google_product_category><g:product_type>${xml(productType)}</g:product_type>`
          : `<fb_product_category>${xml(FB_PRODUCT_CATEGORY)}</fb_product_category><product_type>${xml(productType)}</product_type>`,
      ]
      items.push(`    <item>\n      ${fields.filter(Boolean).join("\n      ")}\n    </item>`)
    }
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">`,
    `  <channel>`,
    `    <title>${xml(feed.title)}</title>`,
    `    <link>${xml(base)}</link>`,
    `    <description>${xml(COMPANY.brand)} ürün feed'i</description>`,
    ...items,
    `  </channel>`,
    `</rss>`,
    "",
  ].join("\n")
}
