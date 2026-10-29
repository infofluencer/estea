import Image from "next/image"
import Link from "next/link"
import { Btn } from "@/components/brand/Btn"
import { doodles, Glass, Sprig, Teapot, type DoodleName } from "@/components/brand/Doodles"
import { FeaturedProductsCarousel, type FeaturedProduct } from "@/components/FeaturedProductsCarousel"
import { FEATURED_FIELDS, mapFeaturedProducts } from "@/lib/featured-products"
import { sdk, storePricingParams } from "@/lib/medusa"
import { categoryPath } from "@/lib/urls"

export const dynamic = "force-dynamic"

/**
 * Ana sayfa metinleri — apps/landing/src/data/content.ts ile aynı TASLAK kopya.
 * TODO(içerik): gerçek marka metinleriyle değiştirin.
 */
const HERO = {
  title: "Çayın lezzeti doğadan",
  lead:
    "Kışı kar altında, yazı güneşte geçen yüksek Karadeniz bahçelerinden özenle toplanan yaprak. Katkısız harman, her yudumda Karadeniz.",
  cta: "Harmanları keşfet",
}

const TAGLINES = [
  "Katkısız, yüzde yüz Karadeniz",
  "Karadeniz’in yüksek bahçelerinden",
  "Tavşan kanı demlik çayı",
  "Üç sürgün, beş karakter",
  "Yapraktan bardağa",
] as const

/** Kategori handle'ları backend seed'iyle (escay-backend seed-escay.ts) aynı. Disk renkleri landing Journey sırası. */
const CATEGORIES: { handle: string; name: string; note: string; icon: DoodleName; disc: string }[] = [
  { handle: "siyah-cay", name: "Siyah Çay", note: "Tavşan kanı demlik çayı; günün her saati.", icon: "glass", disc: "bg-brand text-cream" },
  { handle: "yesil-cay", name: "Yeşil Çay", note: "Taze yaprak, hafif ve ferah bir fincan.", icon: "leaf", disc: "bg-leaf text-ink" },
  { handle: "bitki-cayi", name: "Bitki Çayı", note: "Kafeinsiz, doğal bitki ve çiçek karışımları.", icon: "sprig", disc: "bg-gold text-ink" },
  { handle: "harmanlar", name: "Harmanlar", note: "Üç sürgünün karakterini bir araya getiren harmanlar.", icon: "teapot", disc: "bg-garden text-cream" },
  { handle: "hediye", name: "Hediye", note: "Çay seven herkes için kutulu seçkiler.", icon: "pack", disc: "bg-amber text-cream" },
]

const JOURNEY = [
  { src: "/fabrika/cay-hasadi.jpg", alt: "Çay hasadı: yaprak elle toplanıyor", caption: "Topla" },
  { src: "/fabrika/kalite-kontrol.jpg", alt: "Tadım kâselerinde kalite kontrol", caption: "Denetle" },
  { src: "/fabrika/paketleme-3.jpg", alt: "Paketleme hattı", caption: "Paketle" },
]

const ABOUT = {
  title: "Çayın lezzetine inandık.",
  lead: "Karadeniz’in yüksek rakımlı bahçelerinden gelen yaprağı katkısız harmanlıyoruz. Sisin geç kalktığı yamaçlarda yavaş büyüyen yaprak, aceleye getirilmeden demlenince kendini gösterir.",
  body: "Boya yok, aroma yok; yalnızca yaprak, ustalık ve zaman. Çünkü iyi çay, bekleyeni ödüllendirir.",
  points: [
    { Icon: Sprig, circle: "bg-leaf text-ink", label: "Yüksek bahçe yaprağı" },
    { Icon: Teapot, circle: "bg-gold text-ink", label: "Katkısız harman" },
    { Icon: Glass, circle: "bg-brand text-cream", label: "Tavşan kanı demleme" },
  ],
}

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
  const bandIcons = [Glass, Sprig, Teapot]

  return (
    <div className="home bg-linen text-ink">
      {/* Hero: bahçe fotoğrafı tam genişlikte, metin sol altta perde üstünde (landing Hero / Collection sahnesi). */}
      <section className="relative isolate flex min-h-[88svh] items-end overflow-hidden bg-ink text-cream" aria-label="Es Çay">
        <Image
          src="/home-hero.jpg"
          alt="Karadeniz çay bahçesi, ahşap bir masanın ardında yamaçlar"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[55%_50%]"
        />
        <div className="hero-curtain absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-ink/35 sm:hidden" aria-hidden="true" />
        <div className="hero-copy relative mx-auto w-full max-w-7xl px-5 pt-40 pb-14 sm:px-8 sm:pb-20 lg:pb-24">
          <h1 className="headline max-w-[12ch] text-[clamp(3rem,8vw,7rem)] tracking-[-0.03em] text-cream">{HERO.title}</h1>
          <p className="mt-6 max-w-[42ch] text-[1.1rem] leading-[1.5] text-cream/90 sm:text-[1.25rem]">{HERO.lead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Btn href={categoryPath("harmanlar")} variant="gold">
              {HERO.cta}
            </Btn>
            <Btn href={categoryPath()} variant="outline-cream">
              Tüm çaylar
            </Btn>
          </div>
        </div>
      </section>

      {/* Slogan bandı: landing'deki altın şerit, burada sabit. */}
      <div className="bg-gold text-ink">
        <ul className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-center gap-x-10 gap-y-2 px-5 py-3 sm:px-8" aria-label="Esçay">
          {TAGLINES.map((t, i) => {
            const Icon = bandIcons[i % bandIcons.length]
            return (
              <li key={t} className="flex items-center gap-3 text-[0.95rem] font-bold whitespace-nowrap">
                <Icon className="h-7 w-7 shrink-0" />
                {t}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Kategoriler: landing Journey adımları gibi renkli disk + doodle + Bricolage ad. */}
      <section className="mx-auto max-w-7xl px-5 pt-20 pb-16 sm:px-8 sm:pt-28 sm:pb-20" aria-labelledby="home-cats-title">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end" data-reveal>
          <h2 id="home-cats-title" className="headline text-[clamp(2.4rem,5vw,4rem)] tracking-[-0.025em] lg:col-span-5">
            Her ana ayrı bir çay.
          </h2>
          <p className="max-w-[48ch] text-[1.1rem] leading-[1.55] text-ink/75 lg:col-span-6 lg:col-start-7">
            Sabah demliği için koyu bir siyah, öğleden sonra için hafif bir yeşil, akşam için kafeinsiz bir bitki çayı. Hepsi aynı
            bahçelerden, aynı özenle.
          </p>
        </div>
        <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:mt-16 lg:grid-cols-5 lg:gap-x-8">
          {CATEGORIES.map((c, i) => {
            const Icon = doodles[c.icon]
            return (
              <li key={c.handle} data-reveal style={{ "--reveal-delay": `${i * 70}ms` } as React.CSSProperties}>
                <Link href={categoryPath(c.handle)} className="group flex flex-col items-start gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen rounded-sm">
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:-rotate-6 ${c.disc}`}>
                    <Icon className="h-10 w-10" />
                  </span>
                  <span className="headline block text-[1.5rem] leading-none text-ink transition-colors group-hover:text-brand">{c.name}</span>
                  <span className="-mt-1 block max-w-[24ch] text-[0.95rem] leading-[1.45] text-ink/70">{c.note}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {featured.length ? (
        <section className="home-featured bg-paper py-16 sm:py-24" aria-label="Öne çıkan çaylar">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <FeaturedProductsCarousel
              products={featured}
              title="Öne çıkan çaylar"
              prevLabel="Önceki ürünler"
              nextLabel="Sonraki ürünler"
              desktopVisible={4}
              sideArrows
              autoPlay
            />
          </div>
        </section>
      ) : null}

      {/* Bahçeden bardağa: üç fotoğraf, landing Journey'deki fotoğraf setlerinin kısa hali. */}
      <section className="mx-auto max-w-7xl px-5 pt-16 sm:px-8 sm:pt-24" aria-labelledby="home-journey-title">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <h2 id="home-journey-title" className="headline text-[clamp(2.4rem,5vw,4rem)] tracking-[-0.025em] lg:col-span-5">
            Bahçeden bardağa
          </h2>
          <p className="max-w-[48ch] text-[1.1rem] leading-[1.55] text-ink/75 lg:col-span-6 lg:col-start-7">
            Yaprak yamaçta toplanır, fabrikada soldurulur ve kıvrılır, tadım kâsesinde denetlenir, sonra paketlenir. Her adım
            Hayrat’taki fabrikamızda.
          </p>
        </div>
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {JOURNEY.map((p, i) => (
            <li key={p.src} data-reveal style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
              <figure className="m-0">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-paper">
                  <Image src={p.src} alt={p.alt} fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover transition-transform duration-500 hover:scale-[1.03]" />
                </div>
                <figcaption className="headline mt-4 text-[1.4rem]">{p.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      {/* Hakkımızda şeridi: landing Manifesto; fotoğraf sağda, metin ve üç disk solda. */}
      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-8" aria-labelledby="home-about-title">
        <div className="lg:col-span-5" data-reveal>
          <h2 id="home-about-title" className="text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1] font-bold tracking-[-0.03em] text-garden">
            {ABOUT.title}
          </h2>
          <p className="mt-7 max-w-[30ch] text-[clamp(1.2rem,1.6vw,1.45rem)] leading-[1.45] font-medium text-ink">{ABOUT.lead}</p>
          <p className="mt-5 max-w-[42ch] text-[1rem] leading-relaxed text-ink/75">{ABOUT.body}</p>
          <ul className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {ABOUT.points.map(({ Icon, circle, label }) => (
              <li key={label} className="flex flex-col items-start gap-3">
                <span className={`flex h-16 w-16 items-center justify-center rounded-full ${circle}`}>
                  <Icon className="h-10 w-10" />
                </span>
                <span className="text-[0.92rem] leading-snug font-semibold">{label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <Btn href="/hakkimizda" variant="gold">
              Es Çay’ı yakından tanıyın
            </Btn>
          </div>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-paper lg:col-span-7" data-reveal>
          <Image
            src="/fabrika/fabrika-bahceler.jpg"
            alt="Çay bahçelerinin ortasındaki Es Çay fabrikası"
            fill
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>
    </div>
  )
}
