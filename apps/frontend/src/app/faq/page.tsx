import { FaqAccordion } from "./FaqAccordion"
import styles from "./faq.module.css"

export const metadata = {
  title: "Sıkça Sorulan Sorular | Es Çay",
}

export default function FaqPage() {
  return (
    <div className={`page-shell ${styles.wrap}`}>
      <h1 className={styles.title}>Sıkça Sorulan Sorular</h1>
      <p className={styles.lead}>
        Kargo, iade, ödeme ve ürün bakımı hakkında kısa yanıtlar. Yasal metinler
        kesinleştikçe güncellenir.
      </p>
      <FaqAccordion />
    </div>
  )
}
