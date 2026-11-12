import Image from 'next/image'
import Btn from '@/components/ui/Btn'
import { shelf } from '@/data/shelf'

const link =
  'font-semibold text-ink underline decoration-ink/30 decoration-[1.5px] underline-offset-[6px] transition-colors hover:decoration-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand'

const title = 'headline text-[clamp(1.7rem,2.6vw,2.4rem)] leading-[1.02] tracking-[-0.02em]'

/** Kartın başlığı ve altında ölçü bilgisi, gövde yazısıyla. */
function CardTitle({ name, pack, className = '' }: { name: string; pack: string; className?: string }) {
  return (
    <>
      <h3 className={`${title} ${className}`}>{name}</h3>
      <p className="mt-2 font-semibold">{pack}</p>
    </>
  )
}

type Poset = (typeof shelf)['demlik']

/**
 * Süzen poşet kartı; iki kart da aynı iç düzende: paket, ad ve ölçü, metin,
 * dipte buton satırı. Buton satırı kartın dibine iner, iki kartta aynı hizada kalır.
 */
function PosetCard({
  product,
  soft,
  variant,
  delay,
  className,
  children,
}: {
  product: Poset
  soft: string
  variant: 'garden' | 'gold'
  delay?: string
  className: string
  children?: React.ReactNode
}) {
  return (
    <article
      data-reveal
      style={delay ? ({ '--reveal-delay': delay } as React.CSSProperties) : undefined}
      className={`flex flex-col rounded-2xl border border-ink/10 p-6 sm:p-10 ${soft} ${className}`}
    >
      <div className="relative aspect-[5/3]">
        <Image src={product.image} alt={product.alt} fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-contain" />
      </div>
      <CardTitle name={product.name} pack={product.pack} className="mt-5" />
      <p className="mt-4 text-[1.05rem] leading-[1.6] text-ink/80">{product.body}</p>
      <div aria-hidden="true" className="grow" />
      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-ink/15 pt-6">
        <Btn href={product.href} variant={variant} external>
          {shelf.cta}
        </Btn>
        {children}
      </div>
    </article>
  )
}

/**
 * Harmanların dışındaki ürün hatları: iki süzen poşet düz ton zeminlerde,
 * sekiz bardak poşet bir raf gibi. Paketler public/urunler'deki şeffaf kesimler.
 * Zeminde Yolculuk bölümündeki Esçay çizgi deseni; kartlar ve bitki çayı
 * listesi SSS/Blog'un ince çizgi ve halka diliyle.
 */
export default function Shelf() {
  const { demlik, earlGrey, herbal } = shelf
  return (
    <section id="raf" aria-labelledby="raf-baslik" className="relative z-10 overflow-hidden bg-linen py-24 text-ink sm:py-32">
      {/* Esçay çizgi deseni, Yolculuk'taki gibi soluk; üstte ve altta silinerek komşu bölümlere karışır. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[url(/pattern/escay-vector.webp)] bg-[length:520px_auto] opacity-[0.12] [mask-image:linear-gradient(to_bottom,transparent,#000_160px,#000_calc(100%-200px),transparent)]"
      />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <header className="grid gap-x-8 gap-y-5 border-t border-ink/15 pt-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            {/* Mühür başlığın üstünde, paketteki ve SSS'deki gibi. */}
            <Image
              src="/logo.png"
              alt=""
              width={341}
              height={182}
              className="mb-6 h-16 w-auto -rotate-[5deg] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)] sm:h-20"
            />
            <h2 id="raf-baslik" data-reveal className="headline text-[clamp(2.4rem,5vw,4.6rem)] leading-[0.98] tracking-[-0.025em]">
              {shelf.title}
            </h2>
          </div>
          <p data-reveal style={{ '--reveal-delay': '80ms' } as React.CSSProperties} className="max-w-[46ch] text-[1.15rem] leading-[1.5] text-ink/75 lg:col-span-4">
            {shelf.lead}
          </p>
        </header>

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          <PosetCard product={demlik} soft="bg-leaf-soft" variant="garden" className="lg:col-span-6" />

          <PosetCard product={earlGrey} soft="bg-gold-soft" variant="gold" delay="80ms" className="lg:col-span-6">
            <a href={earlGrey.recipe.href} className={link}>
              {earlGrey.recipe.label}
            </a>
          </PosetCard>

          <div data-reveal className="grid gap-x-8 gap-y-8 rounded-2xl border border-ink/10 bg-paper p-6 sm:p-10 lg:col-span-12 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <CardTitle name={herbal.title} pack={herbal.pack} />
              <p className="mt-4 text-[1.05rem] leading-[1.6] text-ink/80">{herbal.body}</p>
              <div className="mt-7 border-t border-ink/15 pt-6">
                <a href={herbal.all.href} target="_blank" rel="noopener noreferrer" className={link}>
                  {herbal.all.label}
                </a>
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:col-span-9">
              {herbal.items.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
                  >
                    <span className="relative block aspect-[5/4] transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
                      <Image src={item.image} alt="" fill sizes="(min-width: 1024px) 16vw, (min-width: 640px) 22vw, 42vw" className="object-contain" />
                    </span>
                    {/* Ad ve ok halkası ince çizginin altında, Blog kartlarındaki gibi; halka üzerine gelince kırmızıya dolar. */}
                    <span className="mt-3 flex items-center justify-between gap-3 border-t border-ink/15 pt-3">
                      <span className="text-[1rem] font-semibold transition-colors group-hover:text-brand">{item.name}</span>
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/25 text-ink transition-colors duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-cream"
                      >
                        <svg viewBox="0 0 16 16" className="size-3.5 transition-transform duration-200 group-hover:-rotate-45" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
