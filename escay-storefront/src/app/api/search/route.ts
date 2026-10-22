import { NextRequest, NextResponse } from "next/server"
import { PRODUCT_IMAGE, variantPriceAmount } from "@/lib/medusa"
import { searchCatalog } from "@/lib/product-search"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || ""

  if (q.length < 2) {
    return NextResponse.json({ products: [] })
  }

  try {
    const products = await searchCatalog(q, 6)

    return NextResponse.json({
      products: products.map((product) => {
        const price = product.variants?.[0]?.calculated_price
        return {
          id: product.id,
          handle: product.handle,
          title: product.title,
          thumbnail: product.thumbnail || PRODUCT_IMAGE,
          price: variantPriceAmount(price),
        }
      }),
    })
  } catch {
    return NextResponse.json({ products: [] }, { status: 200 })
  }
}
