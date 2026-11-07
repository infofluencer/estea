import { beforeEach, describe, expect, it, vi } from "vitest"

const list = vi.hoisted(() => vi.fn())
vi.mock("@/lib/medusa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/medusa")>()),
  sdk: { store: { product: { list } } },
}))

import { FEEDS, renderProductFeed } from "../product-feed"

const price = (calculated: number, original = calculated) => ({
  calculated_amount: calculated,
  original_amount: original,
})

const product = {
  id: "prod_1",
  handle: "rize-turist",
  title: "Rize Turist & Çay",
  description: "<p>İlk <b>hasat</b>\n  çay</p>",
  thumbnail: "https://cdn.x/a.jpg",
  categories: [{ name: "Siyah Çay" }],
  variants: [
    {
      id: "var_1",
      title: "500 g",
      sku: " RT500 ",
      manage_inventory: true,
      inventory_quantity: 3,
      calculated_price: price(199.9, 249.9),
    },
    {
      id: "var_2",
      title: "Standart",
      sku: null,
      manage_inventory: true,
      inventory_quantity: 0,
      calculated_price: price(99.5),
    },
    { id: "var_3", title: "1 kg", calculated_price: null },
  ],
}

function items(xml: string) {
  return xml.split("<item>").slice(1)
}

beforeEach(() => {
  list.mockReset()
  vi.stubEnv("SITE_URL", "https://market.esteacay.com/")
})

describe("renderProductFeed", () => {
  it("Google: varyant başına item, fiyatlar TRY, indirim sale_price", async () => {
    list.mockResolvedValue({ products: [product], count: 1 })
    const xml = await renderProductFeed("google")
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain(`<title>${FEEDS.google.title}</title>`)
    expect(xml).toContain("<link>https://market.esteacay.com</link>")

    const [a, b, ...rest] = items(xml)
    expect(rest).toHaveLength(0) // fiyatsız var_3 atlanır

    expect(a).toContain("<g:id>RT500</g:id>")
    expect(a).toContain("<g:title>Rize Turist &amp; Çay 500 g</g:title>")
    expect(a).toContain("<g:description><![CDATA[İlk hasat çay]]></g:description>")
    expect(a).toContain(
      "<g:link>https://market.esteacay.com/urun/rize-turist?v=var_1&amp;utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=shopping</g:link>"
    )
    expect(a).toContain("<g:availability>in_stock</g:availability>")
    expect(a).toContain("<g:price>249.90 TRY</g:price>")
    expect(a).toContain("<g:sale_price>199.90 TRY</g:sale_price>")
    expect(a).toContain("<g:size>500 g</g:size>")
    expect(a).toContain("<g:item_group_id>prod_1</g:item_group_id>")
    expect(a).toContain("<g:google_product_category>2073</g:google_product_category>")
    expect(a).toContain("<g:product_type>Çay &gt; Siyah Çay</g:product_type>")

    // SKU'suz varyant → id; "Standart" etiketi başlığa/size'a girmez; indirim yok
    expect(b).toContain("<g:id>var_2</g:id>")
    expect(b).toContain("<g:title>Rize Turist &amp; Çay</g:title>")
    expect(b).not.toContain("<g:size>")
    expect(b).not.toContain("sale_price")
    expect(b).toContain("<g:price>99.50 TRY</g:price>")
    expect(b).toContain("<g:availability>out_of_stock</g:availability>")
  })

  it("Meta: boşluklu availability, fb_product_category", async () => {
    list.mockResolvedValue({ products: [product], count: 1 })
    const xml = await renderProductFeed("meta")
    const [a, b] = items(xml)
    expect(a).toContain("<g:availability>in stock</g:availability>")
    expect(b).toContain("<g:availability>out of stock</g:availability>")
    expect(a).toContain("<fb_product_category>Food &amp; beverages &gt; Beverages</fb_product_category>")
    expect(a).toContain("utm_source=meta")
    expect(a).not.toContain("google_product_category")
  })

  it("seo_description önce; açıklama yoksa başlık; CDATA kaçışı", async () => {
    list.mockResolvedValue({
      products: [
        { ...product, metadata: { seo_description: "SEO ]]> metni" }, variants: [product.variants[0]] },
        { ...product, id: "prod_2", description: null, variants: [product.variants[0]] },
      ],
      count: 2,
    })
    const [a, b] = items(await renderProductFeed("google"))
    expect(a).toContain("<![CDATA[SEO ]]]]><![CDATA[> metni]]>")
    expect(b).toContain("<![CDATA[Rize Turist & Çay]]>")
  })

  it("görsel yoksa image_link yazılmaz; kategori yoksa koleksiyon", async () => {
    list.mockResolvedValue({
      products: [
        {
          ...product,
          thumbnail: null,
          images: [],
          categories: [],
          collection: { title: "Hediye" },
          variants: [product.variants[0]],
        },
      ],
      count: 1,
    })
    const [a] = items(await renderProductFeed("google"))
    expect(a).not.toContain("image_link")
    expect(a).toContain("<g:product_type>Çay &gt; Hediye</g:product_type>")
  })

  it("100'lük sayfalarla tüm kataloğu çeker", async () => {
    list
      .mockResolvedValueOnce({ products: [product], count: 150 })
      .mockResolvedValueOnce({ products: [], count: 150 })
    await renderProductFeed("google")
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1][0]).toMatchObject({ limit: 100, offset: 100, country_code: "tr" })
  })

  it("boş katalog geçerli RSS döner", async () => {
    list.mockResolvedValue({ products: [], count: 0 })
    const xml = await renderProductFeed("google")
    expect(items(xml)).toHaveLength(0)
    expect(xml.trim().endsWith("</rss>")).toBe(true)
  })
})
