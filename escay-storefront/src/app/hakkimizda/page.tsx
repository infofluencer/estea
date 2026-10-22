import Link from "next/link"
import { COMPANY } from "@/lib/company"
import styles from "./about.module.css"

export const metadata = {
  title: "Hakkımızda | Es Çay",
}

/** TODO(içerik): metinler landing taslağından; gerçek marka hikâyesiyle değiştirin. */
export default function AboutPage() {
  return (
    <div className={`page-shell ${styles.wrap}`}>
      <h1 className={styles.title}>Es Çay</h1>
      <p className={styles.lead}>
        Rize ve Artvin’in yüksek bahçelerinden gelen yaprağı katkısız harmanlıyoruz.
        Sisin geç kalktığı yamaçlarda yavaş büyüyen yaprak, aceleye getirilmeden
        demlenince kendini gösterir.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Hikâye</h2>
        <p className={styles.body}>
          Kışı kar altında, yazı güneşte geçen yüksek rakımlı Karadeniz bahçelerinden
          özenle seçilip toplanan yaprak; boya yok, aroma yok. Yalnızca yaprak, ustalık
          ve zaman. Çünkü iyi çay, bekleyeni ödüllendirir.
        </p>
        <p className={styles.body}>
          Siyah çaylarımız, yeşil çaylarımız, bitki çaylarımız ve harmanlarımız aynı
          ilkeyle hazırlanır: yapraktan bardağa, katkısız ve yüzde yüz Karadeniz.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Fabrika ve iletişim</h2>
        <p className={styles.body}>
          {COMPANY.legalName}
          <br />
          {COMPANY.address}
          <br />
          {COMPANY.emailOps} · {COMPANY.phone} ({COMPANY.hours})
          <br />
          Instagram{" "}
          <a href={COMPANY.instagramUrl} target="_blank" rel="noopener noreferrer">
            @{COMPANY.instagram}
          </a>
          {" · "}
          <a href={COMPANY.corporateSite} target="_blank" rel="noopener noreferrer">
            esteacay.com
          </a>
        </p>
      </section>

      <div className={styles.linkRow}>
        <Link href="/urun-kategori/harmanlar" className="cart-cta">
          Harmanlar
        </Link>
        <Link href="/urun-kategori" className="cart-cta">
          Tüm çaylar
        </Link>
        <Link href="/iletisim" className="cart-cta">
          İletişim
        </Link>
      </div>
    </div>
  )
}
