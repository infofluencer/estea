import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { FeaturedProductsCarousel } from "@/components/FeaturedProductsCarousel"
import { TrackViewItem } from "@/components/TrackEvent"
import { ProductPageView } from "@/components/product/ProductPageView"
import { listRelatedProducts } from "@/lib/featured-products"
import {
  PRODUCT_IMAGE,
  sdk,
  storePricingParams,
  variantPriceAmount,
} from "@/lib/medusa"
import { resolveSpecEntries } from "@/lib/spec-labels"
import { siteUrl } from "@/lib/site"
import { productHandleFromSlug, productPath } from "@/lib/urls"

export const dynamic = "force-dynamic"

/** SEO: metadata.seo_title / seo_description → yoksa ürün alanları. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const handle = productHandleFromSlug((await params).slug)
  try {
    const { products } = await sdk.store.product.list({
      handle,
      fields: "title,description,thumbnail,+metadata",
      limit: 1,
    })
    const product = products[0]
    if (!product) return {}
    const meta = (product.metadata || {}) as Record<string, unknown>
    const title =
      (typeof meta.seo_title === "string" && meta.seo_title) ||
      `${product.title} | Es Çay`
    const rawDescription =
      (typeof meta.seo_description === "string" && meta.seo_description) ||
      product.description ||
      ""
    const description = rawDescription.replace(/\s+/g, " ").trim().slice(0, 160)
    const url = `${siteUrl()}${productPath(handle)}`
    return {
      title,
      description: description || undefined,
      alternates: { canonical: url },
      openGraph: {
        title,
        description: description || undefined,
        url,
        type: "website",
        images: product.thumbnail ? [{ url: product.thumbnail }] : undefined,
      },
    }
  } catch {
    return {}
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ v?: string; color?: string }>
}) {
  const slug = decodeURIComponent((await params).slug)
  const handle = productHandleFromSlug(slug)
  const sp = await searchParams
  const { products } = await sdk.store.product.list({
    handle,
    ...storePricingParams(),
    fields:
      "*variants.calculated_price,*variants.options,*options,*options.values,+metadata,+variants.sku,+variants.metadata,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder,*images,*categories,*categories.parent_category,*collection",
  })
  const product = products[0]
  if (!product) notFound()

  const metadata = (product.metadata || {}) as Record<string, unknown>
  const story =
    (typeof metadata.story === "string" && metadata.story.trim()) ||
    (typeof product.description === "string" && product.description.trim()) ||
    null
  const categoryHandles = (product.categories || [])
    .map((c) => c.handle)
    .filter((h): h is string => Boolean(h))
  const specEntries = resolveSpecEntries(metadata, categoryHandles)
  const productSku =
    (product.variants || []).map((v) => (v as { sku?: string | null }).sku).find(Boolean) ?? null

  const images = (product.images || [])
    .map((img) => img.url)
    .filter((url): url is string => Boolean(url))

  const viewedVariant =
    product.variants?.find((v) => v.id === sp.v) || product.variants?.[0]
  const viewItem = viewedVariant
    ? {
        id: viewedVariant.id,
        name: product.title,
        variant: viewedVariant.title || undefined,
        price: variantPriceAmount(viewedVariant.calculated_price) ?? 0,
        quantity: 1,
      }
    : null

  let related: Awaited<ReturnType<typeof listRelatedProducts>> = []
  try {
    related = await listRelatedProducts(product, 16)
  } catch {
    related = []
  }

  return (
    <>
      <TrackViewItem item={viewItem} />
      <ProductPageView
        key={product.id}
        id={product.id}
        title={product.title}
        handle={product.handle}
        story={story}
        thumbnail={product.thumbnail || null}
        images={images.length ? images : [product.thumbnail || PRODUCT_IMAGE]}
        productSku={productSku}
        initialVariantId={sp.v?.trim() || null}
        initialColor={sp.color?.trim() || null}
        options={(product.options || []).map((o) => ({
          id: o.id,
          title: o.title,
          values: (o.values || []).map((v) => ({ id: v.id, value: v.value })),
        }))}
        variants={(product.variants || []).map((v) => ({
          id: v.id,
          title: v.title,
          sku: (v as { sku?: string | null }).sku ?? null,
          inventory_quantity: (v as { inventory_quantity?: number })
            .inventory_quantity,
          manage_inventory: (v as { manage_inventory?: boolean })
            .manage_inventory,
          allow_backorder: (v as { allow_backorder?: boolean }).allow_backorder,
          calculated_price: v.calculated_price,
          options: (v.options || []).map((o) => ({
            option_id: o.option_id,
            value: o.value,
          })),
        }))}
        specEntries={specEntries}
      />

      {related.length > 0 ? (
        <section className="home-featured pdp-related" aria-label="Benzer ürünler">
          <FeaturedProductsCarousel
            products={related}
            title="Benzer ürünler"
            prevLabel="Önceki ürünler"
            nextLabel="Sonraki ürünler"
            desktopVisible={4}
            sideArrows
            autoPlay
          />
        </section>
      ) : null}
    </>
  )
}
