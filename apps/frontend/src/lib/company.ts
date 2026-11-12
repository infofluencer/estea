/**
 * Satıcı / veri sorumlusu künyesi — yasal sayfalar ve iletişim.
 * Kaynak: market.esteacay.com/iletisim (landing `contact` verisi).
 * TODO(K8): e-posta adresi ve domain kesinleşince güncelle.
 */
export const COMPANY = {
  legalName: "Hamzalı Çay Gıda Tur. ve İnş. A.Ş.",
  brand: "Es Çay",
  address: "Balaban Mah. Uğurlu Cad. No: 9, Merkez, Hayrat / Trabzon",
  /** İstanbul adresi; harita linki paylaşılan koordinattan. Kapı numarası henüz yok. */
  istanbulAddress: "Yıldırım Mah. Şehit Kamil Balkan Cad., Bayrampaşa / İstanbul",
  istanbulMapHref: "https://www.google.com/maps?q=41.065407,28.886883",
  phone: "0462 692 30 61",
  phoneHref: "tel:+904626923061",
  hours: "Hafta içi 09.00–18.00",
  emailOps: "info@esteacay.com",
  emailKvkk: "info@esteacay.com",
  site: "https://market.esteacay.com",
  corporateSite: "https://esteacay.com",
  instagram: "esteacay",
  instagramUrl: "https://www.instagram.com/esteacay/",
  facebookUrl: "https://www.facebook.com/esteacay/",
} as const

/** Yasal metinlerin son güncelleme tarihi — hukukçu onayından sonra güncellenir. */
export const LEGAL_UPDATED_AT = "22 Ekim 2026 (taslak)"
