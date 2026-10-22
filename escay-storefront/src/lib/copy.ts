/** Site geneli kısa metinler (yalnızca Türkçe). */
export const COPY = {
  navMain: "Ana menü",
  navMenu: "Menüyü aç",
  navMenuClose: "Menüyü kapat",
  search: "Ara",
  searchClose: "Aramayı kapat",
  searchPlaceholder: "Çay ara…",
  searching: "Aranıyor…",
  searchEmpty: "Ürün bulunamadı",
  profile: "Profil",
  igTitle: "Instagram’da bizi takip edin",
  igBtn: "Takip Et",
  footerTagline: "Rize ve Artvin’in yüksek bahçelerinden,\nkatkısız harmanlanan Karadeniz çayı.",
  footerSignature: "Yapraktan bardağa",
  footerEmail: "E-posta",
  footerEmailPh: "örnek@mail.com",
  footerLogin: "Giriş Yap",
  footerLoginLead: "Fırsatlardan haberdar olmak için giriş yap",
  footerNav: "Footer menü",
  footerCategories: "Çaylar",
  footerCollections: "Keşfet",
  footerHelp: "Yardım",
  footerCart: "Sepet",
  footerFavorites: "Favoriler",
  footerCheckout: "Ödeme",
  footerContact: "İletişim",
  footerRights: "Tüm hakları saklıdır.",
} as const

export type CopyKey = keyof typeof COPY

export function t(key: CopyKey): string {
  return COPY[key]
}

/** Eski `useHomeT()` çağrıları için aynı imza. */
export function useHomeT() {
  return t
}
