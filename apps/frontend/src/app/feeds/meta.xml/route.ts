import { renderProductFeed } from "@/lib/product-feed"

export const dynamic = "force-dynamic"

/** GET /feeds/meta.xml — meta ürün feed'i (RSS 2.0, g: namespace). */
export async function GET() {
  try {
    const body = await renderProductFeed("meta")
    return new Response(body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=1800, s-maxage=1800",
      },
    })
  } catch (error) {
    console.error("[feed:meta]", error)
    return new Response("feed unavailable", { status: 503 })
  }
}
