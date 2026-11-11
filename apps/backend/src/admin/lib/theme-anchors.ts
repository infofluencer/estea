/**
 * Beyaz temanın (widgets/escay-white-theme.tsx) yerleşim düzeltmelerinin dayandığı
 * Medusa dashboard sınıf zincirleri. Bunlar Medusa'nın iç Tailwind sınıfları;
 * @medusajs/dashboard güncellenince değişebilir. `theme-anchors.unit.spec.ts` her
 * zincirin kurulu dashboard paketinde hâlâ geçtiğini doğrular, kaybolursa CI kırılır.
 *
 * CSS'teki seçiciyi değiştirirken bu listeyi de güncelleyin.
 */
export const DASHBOARD_CLASS_ANCHORS = [
  // Sipariş satırı: adet + durum etiketi sütunu
  { use: "sipariş satırı dış ızgara", classes: ["grid-cols-2", "items-center", "px-6"] },
  { use: "sipariş satırı iç ızgara", classes: ["grid-cols-3", "items-center", "gap-x-4"] },
  // Sayfa kenar boşlukları
  { use: "sayfa kabı", classes: ["max-w-[1600px]"] },
  // Kartlar ve kenar çubuğundaki etkin satır
  { use: "kart / etkin menü satırı", classes: ["shadow-elevation-card-rest", "rounded-lg"] },
  // Eklenti sayfası ikon kutusu
  { use: "menü ikon kutusu", classes: ["shadow-borders-base"] },
] as const
