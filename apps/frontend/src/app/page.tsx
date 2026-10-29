import Link from "next/link"
import { CategoryProductCard, type CategoryListProduct } from "@/app/categories/CategoryProductCard"
import { mapProduct, PRODUCT_LIST_FIELDS } from "@/app/categories/CategoriesProductSection"
import cardStyles from "@/app/categories/categories.module.css"
import { HeroSlider, type HeroSlide } from "@/components/home/HeroSlider"
import { sdk, storePricingParams } from "@/lib/medusa"
import { LANDING_LINKS } from "@/lib/site"
import { getStoreCategories, type StoreCategory } from "@/lib/store-categories"
import { CATEGORY_BASE, categoryPath, productPath } from "@/lib/urls"
import "@/components/home/home.css"

export const dynamic = "force-dynamic"

/** Slayt metinleri yalnız esteacay.com'un söylediği iddiaları taşır (PRODUCT.md). */
const SLIDES: HeroSlide[] = [
  {
    image: "/hero/hasat.jpg",
    alt: "Çay bahçesinde hasat",
    focus: "60% 45%",
    tab: "İlk Hasat",
    title: "Mayısın ilk sürgünü: İlk Hasat",
    lead: "Yılın ilk hasadında toplanan taze yapraktan; açık renkli, çiçeksi bir demlik çayı.",
    cta: { label: "İlk Hasat’ı incele", href: productPath("ilk-hasat-cay") },
  },
  {
    image: "/hero/fabrika-bahce.jpg",
    alt: "Çay bahçelerinin ortasındaki Es Çay fabrikası",
    focus: "45% 60%",
    tab: "Fabrikamız",
    title: "Kendi fabrikamız, bahçelerin içinde",
    lead: "Yaprak Hayrat / Trabzon’daki fabrikamızda soldurulur, kıvrılır, tadımdan geçer ve paketlenir.",
    cta: { label: "Bizi tanıyın", href: LANDING_LINKS.about, info: true },
  },
  {
    image: "/hero/bahce.jpg",
    alt: "Doğu Karadeniz yamaçlarında çay bahçeleri",
    focus: "50% 40%",
    tab: "Bahçelerimiz",
    title: "Kışı kar altında geçen bahçelerden",
    lead: "Doğu Karadeniz’in yüksek yamaçlarında yavaş büyüyen yaprak, katkısız harmanlanır.",
    cta: { label: "Siyah çayları incele", href: categoryPath("siyah-cay") },
  },
  {
    image: "/hero/paketleme-hatti.jpg",
    alt: "Paketleme hattında Karadeniz çayı paketleri",
    focus: "50% 50%",
    tab: "Tüm ürünler",
    title: "500 gramdan 5 kiloya, her sofraya bir paket",
    lead: "Dökme çay, demlik süzen poşet ve bitki çayları; ev için de işletme için de.",
    cta: { label: "Tüm ürünleri gör", href: CATEGORY_BASE },
  },
]

/** Ana sayfada ürün şeridi açılacak kategoriler; en az 3 ürünü olanlar gösterilir. */
const STRIP_HANDLES = ["siyah-cay", "bitki-cayi", "harmanlar", "yesil-cay"]
const STRIP_SIZE = 4
const STRIP_MIN = 3

const SERVICES = [
  {
    title: "Fabrikadan kapınıza",
    text: "Siparişiniz Hayrat’taki fabrikamızdan hazırlanır.",
    icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.6 1.6 0 1 0 0-.01M17 19a1.6 1.6 0 1 0 0-.01",
  },
  {
    title: "Güvenli ödeme",
    text: "Kart bilgileriniz PayTR altyapısında işlenir.",
    icon: "M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3",
  },
  {
    title: "Sipariş takibi",
    text: "Siparişinizin durumunu sipariş numarasıyla izleyin.",
    icon: "M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4",
    href: "/order-tracking",
  },
  {
    title: "0462 692 30 61",
    text: "Sorularınız için müşteri hizmetlerimizi arayın.",
    icon: "M6 4h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 2-2z",
    href: "tel:+904626923061",
  },
] as const

type Strip = { category: StoreCategory; products: CategoryListProduct[] }

async function loadStrips(categories: StoreCategory[]): Promise<Strip[]> {
  const chosen = STRIP_HANDLES.map((h) => categories.find((c) => c.handle === h)).filter(
    (c): c is StoreCategory => Boolean(c && c.count >= STRIP_MIN)
  )
  const lists = await Promise.all(
    chosen.map((c) =>
      sdk.store.product
        .list({
          limit: STRIP_SIZE,
          category_id: [c.id],
          ...storePricingParams(),
          fields: PRODUCT_LIST_FIELDS,
        })
        .then((r) => r.products.map(mapProduct))
        .catch(() => [] as CategoryListProduct[])
    )
  )
  return chosen.map((category, i) => ({ category, products: lists[i] })).filter((s) => s.products.length)
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default async function HomePage() {
  const categories = await getStoreCategories()
  const strips = await loadStrips(categories)

  return (
    <div className="home">
      <HeroSlider slides={SLIDES} />

      <section className="home-section" aria-labelledby="home-cats-title">
        <div className="home-wrap">
          <div className="home-head">
            <h2 id="home-cats-title" className="home-head__title">
              Kategoriler
            </h2>
            <Link href={CATEGORY_BASE} className="home-head__link">
              Tüm ürünler
              <ArrowIcon />
            </Link>
          </div>
          <ul className="home-cats">
            {categories.map((c, i) => (
              <li key={c.handle}>
                <Link href={categoryPath(c.handle)} className="home-cat">
                  <span className="home-cat__media">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ürün görselleri backend/S3 adresinden gelir */}
                    <img src={c.image} alt="" width={320} height={320} loading={i < 3 ? "eager" : "lazy"} decoding="async" />
                  </span>
                  <span className="home-cat__name">{c.name}</span>
                  <span className="home-cat__count">{c.count} ürün</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {strips.map(({ category, products }) => (
        <section
          key={category.handle}
          className="home-section home-section--rule"
          aria-labelledby={`strip-${category.handle}`}
        >
          <div className="home-wrap">
            <div className="home-head">
              <h2 id={`strip-${category.handle}`} className="home-head__title">
                {category.name}
              </h2>
              <Link href={categoryPath(category.handle)} className="home-head__link">
                Tümünü gör ({category.count})
                <ArrowIcon />
              </Link>
            </div>
            <ul className={`${cardStyles.grid} ${cardStyles.gridDense} home-strip`}>
              {products.map((p) => (
                <li key={p.cardKey} className={cardStyles.gridItem}>
                  <CategoryProductCard product={p} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="home-services" aria-label="Alışveriş bilgileri">
        <ul className="home-wrap home-services__list">
          {SERVICES.map((s) => {
            const body = (
              <>
                <svg className="home-services__icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d={s.icon} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </span>
              </>
            )
            return (
              <li key={s.title}>
                {"href" in s ? (
                  <a href={s.href} className="home-services__item">
                    {body}
                  </a>
                ) : (
                  <div className="home-services__item">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
