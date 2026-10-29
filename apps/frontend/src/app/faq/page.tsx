import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { Btn } from "@/components/brand/Btn"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "Sıkça Sorulan Sorular | Es Çay",
}

const FAQ_ITEMS: { id: string; q: string; a: ReactNode }[] = [
  {
    id: "kargo",
    q: "Siparişim ne zaman gelir?",
    a: (
      <>
        Siparişiniz stok durumuna göre hazırlanır. Yasal azami teslim süresi 30 gündür. Kargo takip numarası gönderi
        oluşturulunca sipariş detayında görünür. Ayrıntılar: <Link href="/legal/teslimat-ve-kargo">Teslimat ve Kargo</Link>.
      </>
    ),
  },
  {
    id: "iade",
    q: "İade ve cayma nasıl işler?",
    a: (
      <>
        Teslimden itibaren 14 gün içinde cayma hakkınız vardır. Ayıplı üründe kargo ücreti satıcıya aittir; diğer iadelerde
        kargo genellikle alıcıya aittir. İade talebini hesabınızdan (Siparişler) veya{" "}
        <Link href="/order-tracking">sipariş takibinden</Link> oluşturun; iade adresi ve adımlar e-postayla gelir. Çay gıda
        ürünü olduğundan yalnızca ambalajı açılmamış ürünler iade alınır. İade adresi: {COMPANY.address}. Detay:{" "}
        <Link href="/iade-ve-geri-odeme-politikasi">İade ve Cayma</Link>.
      </>
    ),
  },
  {
    id: "odeme",
    q: "Ödeme nasıl alınıyor?",
    a: (
      <>
        Ödemeler PayTR güvenli altyapısı ile alınır. Kredi kartı bilgileriniz yalnızca ödeme anında kullanılır; veri
        tabanında saklanmaz. Havale ile de ödeyebilirsiniz. Ön bilgilendirme:{" "}
        <Link href="/legal/on-bilgilendirme-formu">Ön Bilgilendirme Formu</Link>.
      </>
    ),
  },
  {
    id: "demleme",
    q: "Karadeniz usulü nasıl demlenir?",
    a: (
      <>
        Çift katlı çaydanlık kullanın. Alttaki çaydanlıkta su kaynarken üstteki demliğe bardak başına bir tatlı kaşığı çay
        koyun, kaynar suyu dökün ve kısık ateşte 15–20 dakika demleyin. Yeşil çay için 75–80 °C su ve 2–3 dakika iyi bir
        başlangıçtır. Her ürünün sayfasında kendi demleme önerisi yer alır.
      </>
    ),
  },
  {
    id: "saklama",
    q: "Çayı nasıl saklamalıyım?",
    a: (
      <>
        Serin, kuru ve kokusuz bir yerde, ağzı kapalı bir kapta. Çay yaprağı çevresindeki kokuyu çeker; baharat ve kahve
        gibi ürünlerden uzak tutun. Açılan paketi mümkünse birkaç hafta içinde tüketin.
      </>
    ),
  },
  {
    id: "takip",
    q: "Siparişimi nereden takip ederim?",
    a: (
      <>
        Üye müşteriler <Link href="/hesabim">hesap</Link> üzerinden siparişlerini görür. Misafir siparişler için{" "}
        <Link href="/order-tracking">sipariş takibi</Link> sayfasında sipariş numarası ve e-posta yeterlidir.
      </>
    ),
  },
]

/**
 * Landing FAQ idiomu: paketteki mühür başlığın üstünde, sorular üç sütunda,
 * her biri yerinde açılır (native details/summary). Artı, açıkken marka
 * kırmızısına dolar.
 */
export default function FaqPage() {
  return (
    <div className="bg-linen py-16 text-ink sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <header className="text-center">
          <Image
            src="/logo.png"
            alt=""
            width={341}
            height={182}
            className="mx-auto mb-5 h-16 w-auto -rotate-[5deg] sm:h-20"
          />
          <h1 className="headline text-[clamp(2.6rem,6.4vw,5.4rem)] tracking-[-0.03em]">Sıkça sorulan sorular</h1>
          <p className="mx-auto mt-4 max-w-[60ch] text-[1.1rem] leading-[1.5] text-ink/75 sm:text-[1.2rem]">
            Kargo, iade, ödeme ve demleme üzerine en çok gelen sorular.
          </p>
        </header>

        <dl className="mt-14 grid items-start gap-x-10 gap-y-10 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-12">
          {FAQ_ITEMS.map((item, i) => (
            <details key={item.id} id={item.id} className="group" open={i === 0} data-reveal style={{ "--reveal-delay": `${i * 60}ms` } as React.CSSProperties}>
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-4 pt-2 text-left [&::-webkit-details-marker]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen">
                <span
                  aria-hidden="true"
                  className="relative row-span-2 size-10 shrink-0 self-start rounded-full bg-paper transition-colors duration-200 group-hover:bg-brand group-open:bg-brand before:absolute before:top-1/2 before:left-1/2 before:h-0.5 before:w-4 before:-translate-x-1/2 before:-translate-y-1/2 before:bg-ink before:transition-colors group-hover:before:bg-cream group-open:before:bg-cream after:absolute after:top-1/2 after:left-1/2 after:h-4 after:w-0.5 after:-translate-x-1/2 after:-translate-y-1/2 after:bg-ink after:transition-[transform,background-color] group-hover:after:bg-cream group-open:after:scale-y-0 group-open:after:bg-cream"
                />
                <dt className="headline mt-2 text-[clamp(1.3rem,1.8vw,1.6rem)] leading-[1.1] transition-colors group-hover:text-brand group-open:text-brand">
                  {item.q}
                </dt>
              </summary>
              <dd className="mt-4 pr-14 text-[1.05rem] leading-[1.6] text-ink/75 [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4">
                {item.a}
              </dd>
            </details>
          ))}
        </dl>

        <footer className="mt-14 flex flex-col items-center gap-5 text-center sm:mt-16">
          <p className="max-w-[40ch] text-[1.05rem] leading-[1.5] text-ink/70">
            Cevabını bulamadığınız bir soru mu var? Hafta içi {COMPANY.hours} arasında telefonla ulaşabilirsiniz.
          </p>
          <Btn href="/iletisim" variant="garden">
            Bize ulaşın
          </Btn>
        </footer>
      </div>
    </div>
  )
}
