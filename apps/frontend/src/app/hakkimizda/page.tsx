import Image from "next/image"
import { Btn } from "@/components/brand/Btn"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "Hakkımızda | Es Çay",
}

const POINTS = ["Yüksek bahçe yaprağı", "Katkısız harman", "Tavşan kanı demleme"]

const PHOTOS = [
  { src: "/fabrika/cay-hasadi.jpg", alt: "Çay hasadı: yaprak elle toplanıyor", caption: "Hasat" },
  { src: "/fabrika/kalite-kontrol.jpg", alt: "Tadım kâselerinde kalite kontrol", caption: "Denetim" },
  { src: "/fabrika/paketleme-3.jpg", alt: "Paketleme hattı", caption: "Paketleme" },
]

/** Kurumsal düzen: solda metin ve üç ilke, sağda fabrika fotoğrafı; altta süreç ve künye. */
export default function AboutPage() {
  return (
    <div className="bg-white text-ink">
      <section className="mx-auto grid max-w-7xl gap-12 px-5 pt-16 pb-16 sm:px-8 sm:pt-24 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pb-24" aria-labelledby="hakkimizda-baslik">
        <div className="lg:col-span-5" data-reveal>
          <h1 id="hakkimizda-baslik" className="text-[clamp(2.2rem,3.8vw,3.25rem)] leading-[1.08] font-bold tracking-[-0.025em] text-ink">
            Çayın lezzetine inandık.
          </h1>
          <p className="mt-7 max-w-[30ch] text-[clamp(1.2rem,1.6vw,1.45rem)] leading-[1.45] font-medium text-ink">
            Rize ve Artvin’in yüksek bahçelerinden gelen yaprağı katkısız harmanlıyoruz. Sisin geç kalktığı yamaçlarda yavaş
            büyüyen yaprak, aceleye getirilmeden demlenince kendini gösterir.
          </p>
          <p className="mt-5 max-w-[42ch] text-[1rem] leading-relaxed text-ink/75">
            Kışı kar altında, yazı güneşte geçen yüksek rakımlı Karadeniz bahçelerinden özenle seçilip toplanan yaprak; boya
            yok, aroma yok. Yalnızca yaprak, ustalık ve zaman. Çünkü iyi çay, bekleyeni ödüllendirir.
          </p>
          <ul className="mt-8 grid gap-3 border-t border-line pt-6">
            {POINTS.map((label) => (
              <li key={label} className="flex items-center gap-3 text-[1rem] font-semibold">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 text-brand">
                  <path d="M4 10.5 8 14.5 16 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-paper lg:col-span-7" data-reveal>
          <Image
            src="/fabrika/fabrika-bahceler.jpg"
            alt="Çay bahçelerinin ortasındaki Es Çay fabrikası"
            fill
            priority
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover object-[60%_50%]"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-24" aria-labelledby="yolculuk-baslik">
        <h2 id="yolculuk-baslik" className="headline text-[clamp(2rem,3.6vw,3rem)] tracking-[-0.02em]">
          Bahçeden bardağa
        </h2>
        <p className="mt-4 max-w-[60ch] text-[1.1rem] leading-[1.55] text-ink/75">
          Siyah çaylarımız, yeşil çaylarımız, bitki çaylarımız ve harmanlarımız aynı ilkeyle hazırlanır: yapraktan bardağa,
          katkısız ve yüzde yüz Karadeniz.
        </p>
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {PHOTOS.map((p, i) => (
            <li key={p.src} data-reveal style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
              <figure className="m-0">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-paper">
                  <Image src={p.src} alt={p.alt} fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" />
                </div>
                <figcaption className="headline mt-4 text-[1.3rem]">{p.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28" aria-labelledby="fabrika-baslik">
        <div className="grid gap-8 rounded-lg border border-line bg-surface p-8 sm:p-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <h2 id="fabrika-baslik" className="headline text-[clamp(1.8rem,3vw,2.6rem)] tracking-[-0.02em]">
              Fabrika ve iletişim
            </h2>
            <p className="mt-4 text-[1.05rem] leading-[1.6] text-ink/80">
              {COMPANY.legalName}
              <br />
              {COMPANY.address}
              <br />
              <a href={COMPANY.phoneHref} className="font-semibold text-ink">
                {COMPANY.phone}
              </a>{" "}
              ({COMPANY.hours})
              <br />
              <a href={`mailto:${COMPANY.emailOps}`} className="font-semibold text-ink">
                {COMPANY.emailOps}
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            <Btn href="/urun-kategori/harmanlar" variant="brand">
              Harmanlar
            </Btn>
            <Btn href="/urun-kategori" variant="outline-ink">
              Tüm çaylar
            </Btn>
          </div>
        </div>
      </section>
    </div>
  )
}
