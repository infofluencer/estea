import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  buildPlan,
  htmlBullets,
  htmlToText,
  imageFileName,
  parseCsv,
  slugify,
} from "../wc-import-plan"

const CSV_PATH = resolve(process.cwd(), "data/wc-products.csv")
const IMAGE_DIR = resolve(process.cwd(), "../frontend/public/urunler")

describe("wc-import-plan helpers", () => {
  it("parseCsv handles quotes, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('﻿a,b,c\n1,"x, y","multi\nline"\n2,"he said ""hi""",\n')
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: "multi\nline" },
      { a: "2", b: 'he said "hi"', c: "" },
    ])
  })

  it("slugify folds Turkish characters", () => {
    expect(slugify("Esteaçay-demlik-çay-açık-6000")).toBe("esteacay-demlik-cay-acik-6000")
    expect(slugify("Estea-Süzme-Demlil-2000-gr")).toBe("estea-suzme-demlil-2000-gr")
  })

  it("imageFileName maps WP URLs (incl. png, scaled) to local jpg names", () => {
    expect(imageFileName("https://x/wp-content/uploads/2020/02/estea-gold-cay-1000-gr.jpg")).toBe(
      "estea-gold-cay-1000-gr.jpg"
    )
    expect(imageFileName("https://x/u/SARI500.png")).toBe("sari500.jpg")
    expect(imageFileName("https://x/u/Estea-S%C3%BCzme-Demlil-2000-gr.jpg")).toBe(
      "estea-suzme-demlil-2000-gr.jpg"
    )
  })

  it("htmlToText keeps paragraphs, htmlBullets extracts li items", () => {
    const html = "<p><strong>Es tea</strong> çayı.</p>\\n<p>İkinci&nbsp;paragraf.</p>"
    expect(htmlToText(html)).toBe("Es tea çayı.\n\nİkinci paragraf.")
    expect(htmlBullets("<ul>\\n <li>Bir</li>\\n <li>İki &amp; üç</li></ul>")).toEqual(["Bir", "İki & üç"])
  })
})

describe("buildPlan (gerçek data/wc-products.csv)", () => {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"))
  const plan = buildPlan(rows)

  it("reads all 25 WooCommerce rows", () => {
    expect(rows).toHaveLength(25)
  })

  it("groups into 15 tea-model products with 24 variants", () => {
    expect(plan.products.map((p) => p.handle)).toEqual([
      "gold-karadeniz-cayi",
      "ilk-hasat-cay",
      "karadeniz-cayi",
      "tiryaki-cayi",
      "demlik-suzen-poset-cay",
      "earl-grey-demlik-suzen-poset-cay",
      "kup-seker",
      "bogurtlen-cayi",
      "ihlamur-cayi",
      "kusburnu-cayi",
      "melisa-cayi",
      "yesil-cay-bardak-poset",
      "nane-limon-cayi",
      "papatya-cayi",
      "rezene-cayi",
    ])
    expect(plan.products.reduce((n, p) => n + p.variants.length, 0)).toBe(24)
  })

  it("skips only the unpublished 2000 gr demlik variant; no unmatched rows", () => {
    expect(plan.warnings.filter((w) => w.includes("Eşleşmeyen"))).toEqual([])
    expect(plan.warnings.filter((w) => w.includes("CSV'de yok"))).toEqual([])
    expect(plan.warnings.filter((w) => w.includes("yayımda değil"))).toEqual([
      expect.stringContaining("demlik-suzen-poset-cay 2000 gr"),
    ])
  })

  it("variant SKUs are unique and prices/stock come from the CSV", () => {
    const skus = plan.products.flatMap((p) => p.variants.map((v) => v.sku))
    expect(new Set(skus).size).toBe(skus.length)

    const gold = plan.products.find((p) => p.handle === "gold-karadeniz-cayi")!
    expect(gold.optionTitle).toBe("Gramaj")
    expect(gold.variants.map((v) => [v.title, v.sku, v.price, v.stock])).toEqual([
      ["500 gr", "ESC-GOLD-500", 210, 953],
      ["1000 gr", "ESC-GOLD-1000", 380, 9757],
      ["5000 gr", "ESC-GOLD-5000", 1800, 5853],
    ])
    expect(gold.specifications.weight).toBe("500 gr / 1000 gr / 5000 gr")
    expect(gold.story).toContain("Gold Karadeniz Çayı")
    expect(gold.categoryHandles).toEqual(["siyah-cay"])
    expect(gold.status).toBe("published")

    const seker = plan.products.find((p) => p.handle === "kup-seker")!
    expect(seker.variants.every((v) => v.stock == null && !v.manageInventory)).toBe(true)
    expect(seker.specifications.feature_1).toBe("El değmeden özenle paketlenir.")

    const herbal = plan.products.find((p) => p.handle === "bogurtlen-cayi")!
    expect(herbal.optionTitle).toBe("Paket")
    expect(herbal.variants).toEqual([
      expect.objectContaining({ title: "Bardak Poşet", sku: "ESC-BOGURTLEN-BP", price: 35, stock: 5 }),
    ])
  })

  it("every planned image exists in apps/frontend/public/urunler", () => {
    const missing = plan.products
      .flatMap((p) => p.images)
      .filter((f) => !existsSync(resolve(IMAGE_DIR, f)))
    expect(missing).toEqual([])
    expect(plan.products.every((p) => p.images.length > 0)).toBe(true)
  })
})
