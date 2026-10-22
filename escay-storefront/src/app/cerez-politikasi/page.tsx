import Link from "next/link"
import { CookieTableDisclosure } from "@/components/legal/CookieTableDisclosure"
import { LegalLayout } from "@/components/legal/LegalLayout"
import styles from "@/components/legal/legal.module.css"
import { COMPANY } from "@/lib/company"

export const metadata = {
  title: "Çerez Politikası | Es Çay",
}

export default function CerezPolitikasiPage() {
  return (
    <LegalLayout title="Çerez Politikası">
      <h2>Çerezler nedir?</h2>
      <p>
        Bu Çerez Politikası, çerezlerin ne olduğunu ve bunları nasıl
        kullandığımızı, kullandığımız çerez türlerini, çerezleri kullanarak
        topladığımız bilgileri ve bu bilgilerin nasıl kullanıldığını ve çerez
        ayarlarının nasıl yönetileceğini açıklar.
      </p>
      <p>
        Çerezler, küçük bilgi parçalarını depolamak için kullanılan küçük metin
        dosyalarıdır. Web sitesi tarayıcınıza yüklendiğinde cihazınızda
        depolanırlar. Bu çerezler, web sitesinin düzgün çalışmasını sağlamamıza,
        daha güvenli hale getirmemize ve daha iyi kullanıcı deneyimi sunmamıza
        yardımcı olur.
      </p>

      <h2>1. Çerezleri nasıl kullanıyoruz?</h2>
      <p>
        Web sitemiz, sitenin temel işlevleri (oturum, sepet, sipariş takibi,
        dil/tercih) için birinci taraf çerezleri ve benzeri depolama
        teknolojileri kullanır. Bu çerezler sitenin amaçlandığı şekilde çalışması
        için gereklidir.
      </p>
      <p>
        {/* Tracking script'ler eklenene kadar analitik/reklam çerezi beyan edilmez. */}
        Şu an storefront’ta Google Analytics, Meta Pixel, Microsoft Clarity veya
        benzeri üçüncü taraf izleme script’leri bulunmamaktadır. Bu tür araçlar
        eklenirse bu tablo güncellenecektir.
      </p>

      <h2>2. Bu sitede kullanılan çerezler ve tercihler</h2>
      <p>
        Aşağıdaki tablo yalnızca Es Çay mağazasında gerçekten kullanılan
        teknolojileri listeler.
      </p>

      <h3>Gerekli (birinci taraf)</h3>
      <CookieTableDisclosure
        showLabel="Gerekli bilgileri göster"
        hideLabel="Gerekli bilgileri gizle"
      >
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Süre</th>
                <th>Amaç</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>_escay_jwt</td>
                <td>7 gün</td>
                <td>Müşteri oturumu (giriş)</td>
              </tr>
              <tr>
                <td>_escay_verify_jwt</td>
                <td>24 saat</td>
                <td>E-posta doğrulama yeniden gönderimi</td>
              </tr>
              <tr>
                <td>_escay_cart_id</td>
                <td>14 gün</td>
                <td>Sepet sürekliliği</td>
              </tr>
              <tr>
                <td>_escay_last_order_email / _escay_last_order_id</td>
                <td>24 saat</td>
                <td>Sipariş onay / misafir takip yardımcı çerezleri</td>
              </tr>
              <tr>
                <td>cookieyes-consent</td>
                <td>1 yıl</td>
                <td>Çerez tercihleriniz (CookieYes)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CookieTableDisclosure>

      <h3>Tercih / bilgilendirme (yerel depolama)</h3>
      <CookieTableDisclosure
        showLabel="Tercihen depolanan bilgileri göster"
        hideLabel="Tercihen depolanan bilgileri gizle"
      >
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ad</th>
                <th>Tür</th>
                <th>Amaç</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Favoriler anahtarı</td>
                <td>localStorage</td>
                <td>Misafir favori listesi (giriş sonrası hesaba aktarılır)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CookieTableDisclosure>

      <h2>3. Çerez tercihlerini yönetme</h2>
      <p>
        {/* cky-banner-element: CookieYes tıklamada tercih panelini açar */}
        <button type="button" className={`cky-banner-element ${styles.disclosureBtn}`}>
          Çerez tercihlerimi değiştir
        </button>
      </p>
      <p>
        Tarayıcı ayarlarından çerezleri engelleyebilir veya silebilirsiniz.
        Gerekli çerezleri engellemek sepet, giriş ve sipariş takibi gibi işlevleri
        bozabilir.
      </p>
      <ul>
        <li>
          Chrome:{" "}
          <a
            href="https://support.google.com/accounts/answer/32050"
            target="_blank"
            rel="noopener noreferrer"
          >
            destek belgesi
          </a>
        </li>
        <li>
          Safari:{" "}
          <a
            href="https://support.apple.com/en-in/guide/safari/sfri11471/mac"
            target="_blank"
            rel="noopener noreferrer"
          >
            destek belgesi
          </a>
        </li>
        <li>
          Firefox:{" "}
          <a
            href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox"
            target="_blank"
            rel="noopener noreferrer"
          >
            destek belgesi
          </a>
        </li>
      </ul>
      <p>
        Daha fazla bilgi:{" "}
        <Link href="/gizlilik-politikasi">Gizlilik ve KVKK</Link>. İletişim:{" "}
        {COMPANY.emailOps}.
      </p>
    </LegalLayout>
  )
}
