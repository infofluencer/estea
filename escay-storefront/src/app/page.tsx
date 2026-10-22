import Link from "next/link"
import { FeaturedProductsCarousel, type FeaturedProduct } from "@/components/FeaturedProductsCarousel"
import { FEATURED_FIELDS, mapFeaturedProducts } from "@/lib/featured-products"
import { sdk, storePricingParams } from "@/lib/medusa"
import { categoryPath } from "@/lib/urls"

export const dynamic = "force-dynamic"

/**
 * Ana sayfa metinleri — apps/landing/src/data/content.ts ile aynı TASLAK kopya.
 * TODO(içerik): gerçek marka metinleri ve ana sayfa görseli (public/home-hero.jpg) ile değiştirin.
 */
const HERO = {
  title: "Çayın lezzeti doğadan",
  lead:
    "Kışı kar altında, yazı güneşte geçen yüksek rakımlı Karadeniz bahçelerinden özenle seçilip toplanan yaprak. Boya yok, aroma yok; yalnızca yaprak, ustalık ve zaman.",
  cta: "Harmanları keşfet",
}

/** Kategori handle'ları backend seed'iyle (escay-backend seed-escay.ts) aynı. */
const CATEGORIES = [
  { handle: "siyah-cay", name: "Siyah Çay", note: "Tavşan kanı demlik çayı; günün her saati." },
  { handle: "yesil-cay", name: "Yeşil Çay", note: "Taze yaprak, hafif ve ferah bir fincan." },
  { handle: "bitki-cayi", name: "Bitki Çayı", note: "Kafeinsiz, doğal bitki ve çiçek karışımları." },
  { handle: "harmanlar", name: "Harmanlar", note: "Üç sürgünün karakterini bir araya getiren özel harmanlar." },
  { handle: "hediye", name: "Hediye", note: "Çay seven herkes için kutulu seçkiler." },
] as const

async function listFeaturedProducts(): Promise<FeaturedProduct[]> {
  try {
    const { products } = await sdk.store.product.list({
      limit: 16,
      ...storePricingParams(),
      fields: FEATURED_FIELDS,
      order: "-created_at",
    })
    return mapFeaturedProducts(products).slice(0, 16)
  } catch {
    return []
  }
}

export default async function HomePage() {
  const featured = await listFeaturedProducts()

  return (
    <div className="home">
      <section className="home-intro" aria-label="Es Çay">
        <div>
          <h1 className="home-intro__title">{HERO.title}</h1>
          <p className="home-intro__lead">{HERO.lead}</p>
          <div className="home-intro__actions">
            <Link href={categoryPath("harmanlar")} className="cart-cta">
              {HERO.cta}
            </Link>
            <Link href={categoryPath()} className="cart-cta cart-cta--ghost">
              Tüm çaylar
            </Link>
          </div>
        </div>
        <div className="home-intro__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home-hero.jpg" alt="Karadeniz çay bahçesi" loading="eager" decoding="async" />
        </div>
      </section>

      <section className="home-cats" aria-labelledby="home-cats-title">
        <h2 id="home-cats-title" className="home-cats__title">
          Çaylar
        </h2>
        <ul className="home-cats__grid">
          {CATEGORIES.map((c) => (
            <li key={c.handle}>
              <Link href={categoryPath(c.handle)} className="home-cat">
                <span className="home-cat__name">{c.name}</span>
                <p className="home-cat__note">{c.note}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {featured.length ? (
        <section className="home-featured" aria-label="Öne çıkan çaylar">
          <FeaturedProductsCarousel
            products={featured}
            title="Öne Çıkan Çaylar"
            prevLabel="Önceki ürünler"
            nextLabel="Sonraki ürünler"
            desktopVisible={4}
            sideArrows
            autoPlay
          />
        </section>
      ) : null}
    </div>
  )
}
