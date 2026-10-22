import Link from "next/link"
import { LegalLayout } from "@/components/legal/LegalLayout"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "İade ve Cayma | Es Çay",
}

export default function IadeVeCaymaPage() {
  return (
    <LegalLayout
      title="İade ve Geri Ödeme Politikası"
    >
      {/* TODO(K5 — hukukçu): gıda ürünlerinde cayma hakkı istisnaları (Mesafeli Sözleşmeler
          Yönetmeliği md. 15: çabuk bozulabilen / son kullanma tarihi geçebilecek mallar,
          ambalajı açılmış hijyen/gıda ürünleri) bu metne işlenmeli. Aşağıdaki metin
          genel çerçevedir, onaysız yayınlanmamalıdır. */}
      <p>
        Şirketimiz, tüketici haklarını korumakta ve satış sonrası hizmetinde de
        müşteri memnuniyetini en ön planda tutmaktadır. Satın aldığınız ürünlerle
        ilgili yaşayabileceğiniz memnuniyetsizlik, üretim veya servis kaynaklı her
        türlü sorun, titizlikle değerlendirilmekte ve en kısa sürede çözüme
        kavuşturulmaktadır. Alıcılar, satın aldıkları ürünün satış ve teslimi ile
        ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
        Sözleşmeler Yönetmeliği (RG:27.11.2014/29188) hükümleri ile yürürlükteki
        diğer yasalara tabidir.
      </p>

      <h2>1. İade Edilecek Ürünün Ayıplı Olması Durumu</h2>
      <p>
        Ambalajında, etiketinde, tanıtma ve kullanma kılavuzunda, internet
        portalında ya da reklam ve ilanlarında yer alan özelliklerinden bir veya
        birden fazlasını taşımayan; satıcı tarafından bildirilen veya teknik
        düzenlemesinde tespit edilen niteliğe aykırı olan; muadili olan malların
        kullanım amacını karşılamayan, tüketicinin makul olarak beklediği faydaları
        azaltan veya ortadan kaldıran maddi, hukuki veya ekonomik eksiklikler
        içeren mallar ayıplı olarak kabul edilir.
      </p>
      <p>
        Satıcı veya sağlayıcı, tüketicinin siparişinin kendisine ulaştığı andan
        itibaren taahhüt edilen süre içinde edimini yerine getirir. Mal
        satışlarında bu süre her hâlükârda otuz günü geçemez. Satıcı veya
        sağlayıcının bu süre içinde edimini yerine getirmemesi durumunda tüketici
        sözleşmeyi feshedebilir.
      </p>

      <h2>2. Cayma Hakkı</h2>
      <p>
        <strong>Gıda ürünü uyarısı:</strong> Çay, gıda ürünüdür. Ambalajı açılmış,
        tadılmış veya hijyenik niteliği bozulmuş ürünlerde cayma hakkı kullanılamaz;
        iade yalnızca ambalajı açılmamış ve orijinal haliyle gönderilen ürünler için
        geçerlidir. Ayıplı ürünlerde bu kısıt uygulanmaz.
      </p>
      <p>
        Tüketici, on dört gün içinde herhangi bir gerekçe göstermeksizin ve cezai
        şart ödemeksizin sözleşmeden cayma hakkına sahiptir. Cayma hakkının
        kullanıldığına dair bildirimin bu süre içinde satıcı veya sağlayıcıya
        yöneltilmiş olması yeterlidir. Satıcı veya sağlayıcı, cayma hakkı
        konusunda tüketicinin bilgilendirmekle yükümlü olup, iptal ve iade
        şartlarının sitede ürün satın alma işlemi sırasında okunup kabul edilmesi
        ile tüketici bu hususta bilgilendirilmiş olduğunu kabul etmiş sayılır.
      </p>

      <h2>3. İade Talebi Nasıl Oluşturulur?</h2>
      <p>
        İade veya cayma bildiriminizi site üzerinden elektronik ortamda
        iletebilirsiniz. Manuel dilekçe veya sevk irsaliyesi gönderimi
        zorunlu değildir; talep, aşağıdaki kanallardan biri ile oluşturulur:
      </p>
      <ol>
        <li>
          <strong>Üye müşteriler:</strong>{" "}
          <Link href="/hesabim">Hesabım → Siparişler</Link> bölümünden ilgili
          siparişi açın ve “İade talebi oluştur” ile kalem, adet ve iade sebebini
          seçin.
        </li>
        <li>
          <strong>Misafir müşteriler:</strong>{" "}
          <Link href="/order-tracking">Sipariş takibi</Link> sayfasında sipariş
          numarası (order id) ve siparişte kullandığınız e-posta ile siparişi
          görüntüleyin; ardından aynı şekilde iade talebi oluşturun.
        </li>
        <li>
          Talebiniz alındığında size bir iade numarası iletilir (e-posta ile de
          bilgilendirilirsiniz). Onay ekranında ve bilgilendirme mesajında
          kargolama adresi ile kısa adımlar gösterilir.
        </li>
        <li>
          Talebiniz alındığında size e-postayla bir iade kodu ve kargo firması
          bilgisi iletilir. Ürünü ambalajı açılmamış ve orijinal haliyle
          paketleyip bu kodla kargo şubesine teslim edin; kod gelmeden kargoya vermeyin.
        </li>
        <li>
          Ürün SATICI’ya ulaştıktan ve iade incelemesi tamamlandıktan sonra
          ödemenizin iadesi başlatılır.
        </li>
      </ol>

      <h2>4. Ürün İadesi, Kargo Ücretleri ve Geri Ödeme</h2>
      <ol>
        <li>
          ALICI, Ürün’ü teslim aldığı anda kontrol etmekle ve Ürün’de kargodan
          kaynaklanan bir sorun gördüğünde, Ürün’ü kabul etmemek ve kargo firması
          yetkilisine tutanak tutturmakla sorumludur. Aksi halde SATICI
          sorumluluk kabul etmeyecektir.
        </li>
        <li>
          ALICI’nın, SATICI tarafından aksi yazılı şekilde öngörülmediği takdirde
          Ürün’ü teslim almadan önce bedelini tamamen ödemiş olması gerekmektedir.
        </li>
        <li>
          Ürün, ALICI’dan başka bir kişi/kuruluşa teslim edilecek ise, teslim
          edilecek kişi/kuruluşun adresinde bulunmaması veya teslimatı kabul
          etmemesinden SATICI sorumlu tutulamaz.
        </li>
        <li>
          Ürün’ün olağanüstü durumlar (hava muhalefeti, yoğun trafik, deprem, sel,
          yangın gibi) nedeniyle yasal azami 30 günlük süre zarfında teslim
          edilememesi söz konusu ise, SATICI teslimat ile ilgili olarak ALICI’yı
          bilgilendirir. Bu durumda ALICI siparişi iptal edebilir, benzer bir ürün
          sipariş edebilir veya olağanüstü durum sonuna kadar bekleyebilir.
        </li>
        <li>
          Sözleşme ve kanuna uygun caymalar dahil sipariş iptallerinde ve
          Sözleşme fesihlerinde, Ürün bedeli tahsil edilmiş ise, azami 14 gün
          içinde ALICI’ya iade edilir. İade ALICI’nın SATICI’ya Ürün bedeli
          tediyesinde kullandığı ödeme aracına uygun bir şekilde yapılır. Kredi
          kartlı ödemelerde iade de ALICI kredi kartına yapılır; bankaya yansıma
          süresi banka işlem sürecine bağlıdır.
        </li>
        <li>
          İade edilecek ürün/ürünler ayıplı ise iade kargo ücreti SATICI
          tarafından karşılanır. Diğer hallerde (cayma, beğenmeme, gramaj/çeşit
          uymaması vb.) iade kargo ücreti ALICI’ya aittir. Her iki durumda da
          ürünü ALICI, anlaşmalı kargo ile iade adresine gönderir.
        </li>
        <li>
          Gramaj/çeşit değişimi: ALICI, sipariş sayfasından “Gramaj / çeşit
          değişimi” ile aynı ürünün stoktaki başka gramaj veya çeşidini seçebilir.
          Ürün SATICI’ya açılmamış ulaşıp kontrol edildikten sonra seçilen ürün kargo
          ücreti SATICI’ya ait olmak üzere gönderilir; değişimde ürün bedeli iade
          edilmez. İade kargo ücreti yukarıdaki kurala tabidir.
        </li>
      </ol>

      <h2>5. Sipariş İptali</h2>
      <p>
        Yanlış verdiğiniz veya vazgeçtiğiniz siparişlerinizi iptal
        ettirebilirsiniz. İptal işlemlerinde ürün kargoya verilmemişse ücretin
        tamamı işlemi gerçekleştirdiğiniz yöntemle iade edilir. Sipariş
        iptalinizin öğrenilmesinden önce ürünün kargoya verilmişse kargo ücreti
        veya ücretleri kesilerek iadesi yapılır. Kargoya verilmiş ürünler için
        iade talebi süreci (bölüm 3) uygulanır.
      </p>

      <h2>6. Ürün İade Adresi</h2>
      <p>
        <strong>{COMPANY.legalName}</strong>
        <br />
        {COMPANY.address}
        <br />
        Telefon: {COMPANY.phone}
        <br />
        E-posta: {COMPANY.emailOps}
      </p>
      <p>
        Destek için{" "}
        <Link href="/iletisim">iletişim formu</Link> veya {COMPANY.emailOps}{" "}
        kullanılabilir. Sipariş görüntüleme:{" "}
        <Link href="/order-tracking">sipariş takibi</Link> · üye müşteriler{" "}
        <Link href="/hesabim">hesabım</Link>. İlgili belgeler:{" "}
        <Link href="/legal/mesafeli-satis-sozlesmesi">
          Mesafeli Satış Sözleşmesi
        </Link>
        .
      </p>
    </LegalLayout>
  )
}
