"use client"

import { useState } from "react"
import Link from "next/link"
import { COMPANY } from "@/lib/company"
import styles from "./faq.module.css"

const FAQ_ITEMS = [
  {
    id: "kargo",
    title: "Kargo ve teslimat",
    body: (
      <>
        Siparişiniz stok durumuna göre hazırlanır. Yasal azami teslim süresi 30
        gündür. Kargo takip numarası fulfillment sonrası sipariş detayında
        görünür. Ayrıntılar:{" "}
        <Link href="/legal/teslimat-ve-kargo">Teslimat ve Kargo</Link>.
      </>
    ),
  },
  {
    id: "iade",
    title: "İade ve cayma",
    body: (
      <>
        Teslimden itibaren 14 gün içinde cayma hakkınız vardır. Ayıplı üründe
        kargo ücreti satıcıya aittir; diğer iadelerde kargo genellikle alıcıya
        aittir. İade talebini hesabınızdan (Siparişler) veya{" "}
        <Link href="/order-tracking">sipariş takibinden</Link> (order id +
        e-posta) oluşturun; iade kodu ve kargo bilgisi e-postayla gelir. Çay gıda
        ürünü olduğundan yalnızca ambalajı açılmamış ürünler iade alınır. İade
        adresi: {COMPANY.address}. Detay:{" "}
        <Link href="/iade-ve-geri-odeme-politikasi">İade ve Cayma</Link> ·{" "}
        <Link href="/legal/mesafeli-satis-sozlesmesi">
          Mesafeli Satış Sözleşmesi
        </Link>
        .
      </>
    ),
  },
  {
    id: "odeme",
    title: "Ödeme",
    body: (
      <>
        Ödemeler PayTR güvenli altyapısı ile alınır. Kredi kartı bilgileriniz
        yalnızca ödeme anında kullanılır; veri tabanında saklanmaz. Ön
        bilgilendirme:{" "}
        <Link href="/legal/on-bilgilendirme-formu">Ön Bilgilendirme Formu</Link>
        .
      </>
    ),
  },
  {
    id: "demleme",
    title: "Demleme ve saklama",
    body: (
      <>
        Demleme oranı, süresi ve su sıcaklığı her ürünün sayfasında yer alır.
        Siyah çay için kaynar su ve 15–20 dakika demlik; yeşil çay için 75–80 °C
        su ve 2–3 dakika iyi bir başlangıçtır. Çayı serin, kuru ve kokusuz bir
        yerde, ağzı kapalı kapta saklayın.
      </>
    ),
  },
  {
    id: "takip",
    title: "Sipariş takibi",
    body: (
      <>
        Üye müşteriler <Link href="/hesabim">hesap</Link> üzerinden siparişlerini
        görür. Misafir siparişler için{" "}
        <Link href="/order-tracking">sipariş takibi</Link> sayfasında order ID +
        e-posta yeterlidir.
      </>
    ),
  },
] as const

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>(FAQ_ITEMS[0].id)

  return (
    <div className={styles.list}>
      {FAQ_ITEMS.map((item) => {
        const open = openId === item.id
        return (
          <div key={item.id} className={styles.item}>
            <button
              type="button"
              className={styles.trigger}
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : item.id)}
            >
              <span>{item.title}</span>
              <span
                className={`${styles.icon}${open ? ` ${styles.iconOpen}` : ""}`}
                aria-hidden
              />
            </button>
            {open ? <div className={styles.panel}>{item.body}</div> : null}
          </div>
        )
      })}
    </div>
  )
}
