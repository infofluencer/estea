import { useState } from 'react'

type Product = {
  name: string
  description: string
  image: string
  accent: string
  hoverShadow: string
  imageTone: string
}

const products: Product[] = [
  {
    name: 'Tiryaki',
    description: 'Koyu demlenen, dolgun gövdeli.',
    image: '/tiryaki.png',
    accent: 'bg-brand',
    hoverShadow: 'hover:shadow-[0_24px_48px_-28px_rgba(200,16,46,0.7)]',
    imageTone: 'bg-[#f3e4e4]',
  },
  {
    name: 'İlk Hasat',
    description: 'Sezonun ilk sürgünleri. Berrak ve taze içim.',
    image: '/ilkhasat.png',
    accent: 'bg-garden',
    hoverShadow: 'hover:shadow-[0_24px_48px_-28px_rgba(47,82,51,0.55)]',
    imageTone: 'bg-[#e6eee6]',
  },
  {
    name: 'Gold',
    description: 'Seçme Karadeniz harmanı. Dengeli ve aromatik.',
    image: '/gold.png',
    accent: 'bg-ink',
    hoverShadow: 'hover:shadow-[0_24px_48px_-28px_rgba(26,21,18,0.55)]',
    imageTone: 'bg-[#ece7dc]',
  },
]

function ProductImage({
  src,
  alt,
  fallbackClass,
}: {
  src: string
  alt: string
  fallbackClass: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className={`flex aspect-[4/5] items-center justify-center ${fallbackClass}`}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      width={640}
      height={800}
      className="mx-auto h-auto w-[78%] max-w-[240px] object-contain drop-shadow-none sm:w-[82%]"
      onError={() => setFailed(true)}
    />
  )
}

export default function Products() {
  return (
    <section id="urunler" className="bg-cream scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[0.7rem] font-medium tracking-[0.28em] text-amber uppercase">
            Harmanlar
          </p>
          <h2 className="mt-3 font-sans text-3xl font-extrabold tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            Üç harman, tek bahçe
          </h2>
        </div>

        <ul className="mt-14 grid grid-cols-1 gap-8 md:mt-16 md:grid-cols-3 md:gap-6 lg:gap-8">
          {products.map((product) => (
            <li key={product.name}>
              <article
                className={`h-full overflow-hidden rounded-sm transition-transform duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:-translate-y-1.5 ${product.hoverShadow}`}
              >
                <div className={`h-1.5 ${product.accent}`} aria-hidden="true" />
                <div
                  className={`flex min-h-[280px] items-center justify-center px-6 py-8 sm:min-h-[320px] ${product.imageTone}`}
                >
                  <ProductImage
                    src={product.image}
                    alt={`Es Çay ${product.name} paketi`}
                    fallbackClass={product.accent}
                  />
                </div>
                <div className="px-6 py-6 sm:px-7 sm:py-7">
                  <h3 className="font-sans text-xl font-extrabold tracking-tight text-ink">
                    {product.name}
                  </h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/70">
                    {product.description}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>

        <div
          id="hikaye"
          className="mx-auto mt-20 max-w-xl scroll-mt-24 border-t border-ink/10 pt-16 text-center sm:mt-28 sm:pt-20"
        >
          <p className="text-[0.7rem] font-medium tracking-[0.28em] text-garden uppercase">
            Hikayemiz
          </p>
          <h2 className="mt-3 font-sans text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Sis, eğim, sabır
          </h2>
          <p className="mt-5 text-[0.98rem] leading-relaxed text-ink/70 sm:text-base">
            Es Çay, Rize ve Artvin'in yüksek bahçelerinde yetişen yapraklardan
            harmanlanır. Katkı yok, acele yok — yalnızca toprağın verdiği.
          </p>
        </div>
      </div>
    </section>
  )
}
