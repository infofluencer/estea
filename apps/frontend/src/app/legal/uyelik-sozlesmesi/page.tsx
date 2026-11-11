import Link from "next/link"
import { LegalLayout } from "@/components/legal/LegalLayout"
import type { Metadata } from "next"
import { COMPANY } from "@/lib/company"
import { isDraftLegalVersion, MEMBERSHIP_TERMS } from "@/lib/legal"

export const metadata: Metadata = {
  title: "Üyelik Sözleşmesi | Es Çay",
  // Hukukçu onayı gelene dek arama motorlarına kapalı
  ...(isDraftLegalVersion(MEMBERSHIP_TERMS.version)
    ? { robots: { index: false, follow: true } }
    : {}),
}

export default function UyelikSozlesmesiPage() {
  return (
    <LegalLayout title="Üyelik Sözleşmesi" updatedAt={MEMBERSHIP_TERMS.updatedAt}>
      <p>
        Bu metin, {COMPANY.legalName} tarafından işletilen {COMPANY.brand}{" "}
        mağazasına üyeliğin koşullarını düzenler. Kayıt formundaki onay kutusunu
        işaretleyerek bu koşulları kabul edersiniz; kabul tarihi ve metnin sürümü
        üyelik kaydınızda saklanır.
      </p>

      <h2>Yeni Üyelik</h2>
      <p>
        Üye olmak için kayıt formunu doldurmanız ve e-posta adresinizi
        doğrulamanız yeterlidir. İletişim ve teslimatta sorun yaşanmaması için
        bilgilerinizi doğru ve eksiksiz girmeniz önemlidir. Üyelik, 18 yaşını
        doldurmuş kişilere açıktır; kayıt sırasında 18 yaşını doldurduğunuzu
        beyan edersiniz. Beyanın gerçeğe aykırı olduğu anlaşılırsa üyelik
        kapatılabilir.
      </p>
      <p>
        Üye olmak sizi alışveriş yapmakla yükümlü kılmaz. Sipariş vermeden önce{" "}
        <Link href="/legal/on-bilgilendirme-formu">Ön Bilgilendirme Formu</Link>{" "}
        ve{" "}
        <Link href="/legal/mesafeli-satis-sozlesmesi">
          Mesafeli Satış Sözleşmesi
        </Link>
        ’ni okumanızı rica ederiz.
      </p>

      <h2>Üyelik İptali</h2>
      <p>
        Üyeliğinizi dilediğiniz zaman sonlandırabilirsiniz. Talebinizi kayıtlı
        e-posta adresinizden <Link href="/iletisim">iletişim formu</Link> veya{" "}
        {COMPANY.emailOps} üzerinden iletmeniz yeterlidir.
      </p>
      <ul>
        <li>
          Devam eden sipariş, iade veya ödeme işleminiz varsa üyeliğiniz bu
          işlemler tamamlandıktan sonra kapatılır.
        </li>
        <li>
          Talep kayıtlı adres dışındaki bir e-postadan gelirse veya size kayıtlı
          bilgilerinizden ulaşılamazsa, kimliğiniz doğrulanana kadar talep
          işleme alınmaz.
        </li>
        <li>
          Fatura ve sipariş kayıtları gibi yasal olarak saklanması gereken
          veriler, üyelik kapansa da{" "}
          <Link href="/gizlilik-politikasi">Gizlilik ve KVKK</Link> metnindeki
          süreler boyunca tutulur.
        </li>
      </ul>

      <h2>Üyeliğin Tarafımızca Sonlandırılması</h2>
      <p>Aşağıdaki durumlarda üyelik {COMPANY.brand} tarafından sonlandırılabilir:</p>
      <ul>
        <li>Üyenin site üzerinden genel ahlaka aykırı içerik göndermesi,</li>
        <li>Sahtekârlık girişiminde bulunulması,</li>
        <li>Siteye, sistemlere veya {COMPANY.brand} adına zarar verecek girişimlerde bulunulması.</li>
      </ul>

      <h2>Üye Güvenliği</h2>
      <p>
        Mağazamızda üye güvenliği için gerekli önlemler alınmıştır. Bunun
        yanında üye bilgilerinizin güvenliğinden siz de sorumlusunuz. Giriş
        bilgilerinizi kimseyle paylaşmayın ve güvenli olduğundan emin olmadığınız
        cihazlardan giriş yapmayın.
      </p>

      <h2>Farklı Teslimat Adresi</h2>
      <p>
        Sipariş verirken kayıtlı adresiniz dışında bir teslimat adresi
        girebilirsiniz. Bu seçeneği arkadaşınıza hediye gönderirken veya
        kendiniz farklı bir adreste bulunduğunuz dönemlerde kullanabilirsiniz.
      </p>

      <h2>Kişisel Veriler</h2>
      <p>
        Üyelik sırasında verdiğiniz bilgiler{" "}
        <Link href="/gizlilik-politikasi">Gizlilik ve KVKK</Link> metnine göre
        işlenir.
      </p>

      <h2>İletişim</h2>
      <p>
        {COMPANY.legalName}
        <br />
        {COMPANY.address}
        <br />
        {COMPANY.emailOps} · {COMPANY.phone}
      </p>
    </LegalLayout>
  )
}
