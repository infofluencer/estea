import Image from "next/image"
import { Btn } from "@/components/brand/Btn"
import { Glass, Sprig, Teapot } from "@/components/brand/Doodles"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "Hakkımızda | Es Çay",
}

const POINTS = [
  { Icon: Sprig, circle: "bg-leaf text-ink", label: "Yüksek bahçe yaprağı" },
  { Icon: Teapot, circle: "bg-gold text-ink", label: "Katkısız harman" },
  { Icon: Glass, circle: "bg-brand text-cream", label: "Tavşan kanı demleme" },
]

const PHOTOS = [
  { src: "/fabrika/cay-hasadi.jpg", alt: "Çay hasadı: yaprak elle toplanıyor", caption: "Hasat" },
  { src: "/fabrika/kalite-kontrol.jpg", alt: "Tadım kâselerinde kalite kontrol", caption: "Denetim" },
  { src: "/fabrika/paketleme-3.jpg", alt: "Paketleme hattı", caption: "Paketleme" },
]

/** Landing Manifesto idiomu: zeytin yeşili başlık, orta boy giriş, üç disk, fotoğraf sağda. */
export default function AboutPage() {
  return (
    <div className="bg-linen text-ink">
      <section className="mx-auto grid max-w-7xl gap-12 px-5 pt-16 pb-16 sm:px-8 sm:pt-24 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pb-24" aria-labelledby="hakkimizda-baslik">
        <div className="lg:col-span-5" data-reveal>
          <h1 id="hakkimizda-baslik" className="text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1] font-bold tracking-[-0.03em] text-garden">
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
          <ul className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {POINTS.map(({ Icon, circle, label }) => (
              <li key={label} className="flex flex-col items-start gap-3">
                <span className={`flex h-16 w-16 items-center justify-center rounded-full ${circle}`}>
                  <Icon className="h-10 w-10" />
                </span>
                <span className="text-[0.92rem] leading-snug font-semibold">{label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-paper lg:col-span-7" data-reveal>
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
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-paper">
                  <Image src={p.src} alt={p.alt} fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" />
                </div>
                <figcaption className="headline mt-4 text-[1.3rem]">{p.caption}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28" aria-labelledby="fabrika-baslik">
        <div className="grid gap-8 rounded-2xl bg-paper p-8 sm:p-10 lg:grid-cols-12 lg:items-center">
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
