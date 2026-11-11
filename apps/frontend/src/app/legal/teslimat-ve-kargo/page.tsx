import Link from "next/link"
import { LegalLayout } from "@/components/legal/LegalLayout"
import { COMPANY } from "@/lib/company"
import { POLICY_UPDATED_AT } from "@/lib/legal"

export const metadata = {
  title: "Teslimat ve Kargo | Es Çay",
}

export default function TeslimatVeKargoPage() {
  return (
    <LegalLayout title="Teslimat ve Kargo" updatedAt={POLICY_UPDATED_AT}>
      <h2>Kargo ücreti</h2>
      <p>
        Standart kargo ücreti checkout sırasında gösterilir. Kampanya ve ücretsiz
        kargo eşikleri duyurularda belirtilir.
      </p>

      <h2>Teslimat süresi</h2>
      <p>
        Satıcı veya sağlayıcı, tüketicinin siparişinin kendisine ulaştığı andan
        itibaren taahhüt edilen süre içinde edimini yerine getirir. Mal
        satışlarında bu süre her hâlükârda otuz günü geçemez. Siparişler stok
        durumuna göre hazırlanır; kargo firması ataması fulfillment sonrasında
        yapılır.
      </p>
      <p>
        Siparişiniz, ödemeniz onaylandıktan sonra 5 iş günü içinde kargoya
        teslim edilir. Bayram ve resmî tatil günlerinde teslimat yapılmaz.
        Tarafımızdan kaynaklanan bir aksaklıkta size siparişteki iletişim
        bilgilerinizden haber verilir; bu yüzden bilgilerinizin doğru ve eksiksiz
        olması önemlidir.
      </p>

      <h2>Stokta kalmayan ürün</h2>
      <p>
        Mağazamızda aynı anda birçok kişi alışveriş yapabildiğinden, ödemesini
        yaptığınız ürün nadiren de olsa stokta kalmayabilir. Bu durumda
        siparişiniz açılmaz ve durumu öğrendiğimiz tarihten itibaren en geç 3
        gün içinde size e-posta veya telefonla bildiririz.
      </p>
      <p>
        Onay verirseniz eşit kalite ve fiyatta başka bir ürün gönderebiliriz.
        Onay vermezseniz, kargo ücreti dahil ödediğiniz tüm tutar bildirim
        tarihinden itibaren en geç 14 gün içinde ödemede kullandığınız karta
        iade edilir.
      </p>

      <h2>Hasarlı veya eksik paket</h2>
      <p>
        Teslimatta yapmanız gerekenler{" "}
        <Link href="/iade-ve-geri-odeme-politikasi#hasarli-teslimat">
          İade ve Cayma sayfasının 5. bölümünde
        </Link>{" "}
        anlatılır.
      </p>

      <h2>Takip</h2>
      <p>
        Kargo takip numarası oluştuğunda sipariş detayında görünür. Üye
        müşteriler <Link href="/hesabim">hesap</Link> üzerinden; misafir
        siparişler <Link href="/order-tracking">sipariş takibi</Link> (order ID +
        e-posta) ile sorgulanır.
      </p>

      <h2>İletişim</h2>
      <p>
        {COMPANY.legalName}
        <br />
        {COMPANY.address}
        <br />
        {COMPANY.emailOps} · {COMPANY.phone}
      </p>

      <h2>İlgili belgeler</h2>
      <p>
        <Link href="/legal/mesafeli-satis-sozlesmesi">
          Mesafeli Satış Sözleşmesi
        </Link>
        {" · "}
        <Link href="/iade-ve-geri-odeme-politikasi">İade ve Cayma</Link>
      </p>
    </LegalLayout>
  )
}
