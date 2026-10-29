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
    <div className="bg-white py-12 text-ink sm:py-16">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <header>
          <h1 className="headline text-[clamp(2rem,3.6vw,2.75rem)]">Sıkça sorulan sorular</h1>
          <p className="mt-3 max-w-[60ch] text-[1.05rem] leading-[1.55] text-ink-soft">
            Kargo, iade, ödeme ve demleme üzerine en çok gelen sorular.
          </p>
        </header>

        <div className="mt-10 border-t border-line">
          {FAQ_ITEMS.map((item, i) => (
            <details key={item.id} id={item.id} className="group border-b border-line" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left [&::-webkit-details-marker]:hidden">
                <h2 className="text-[1.125rem] leading-[1.35] font-semibold transition-colors group-hover:text-brand group-open:text-brand">
                  {item.q}
                </h2>
                <span
                  aria-hidden="true"
                  className="relative size-5 shrink-0 before:absolute before:top-1/2 before:left-0 before:h-[1.5px] before:w-5 before:-translate-y-1/2 before:bg-current after:absolute after:top-0 after:left-1/2 after:h-5 after:w-[1.5px] after:-translate-x-1/2 after:bg-current after:transition-transform group-open:after:scale-y-0"
                />
              </summary>
              <div className="pb-6 pr-10 text-[1rem] leading-[1.7] text-ink-soft [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-4">
                {item.a}
              </div>
            </details>
          ))}
        </div>

        <footer className="mt-10 flex flex-col items-start gap-4 rounded-lg border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[44ch] text-[1rem] leading-[1.5] text-ink-soft">
            Cevabını bulamadığınız bir soru mu var? {COMPANY.hours} arasında {COMPANY.phone} numarasından ulaşabilirsiniz.
          </p>
          <Btn href="/iletisim" variant="garden">
            Bize ulaşın
          </Btn>
        </footer>
      </div>
    </div>
  )
}
