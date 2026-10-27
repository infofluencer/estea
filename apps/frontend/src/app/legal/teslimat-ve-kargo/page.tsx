import Link from "next/link"
import { LegalLayout } from "@/components/legal/LegalLayout"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "Teslimat ve Kargo | Es Çay",
}

export default function TeslimatVeKargoPage() {
  return (
    <LegalLayout title="Teslimat ve Kargo">
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
