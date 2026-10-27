// Medusa'nın Türkçe çevirisinde eksik kalan anahtarlar (rol/izin, profil, ürün
// seçenekleri, fiyat listeleri, giriş MFA…) + bilerek değiştirilen etiketler.
// Dashboard eklenti çevirilerini çekirdeğin ÜSTÜNE deepMerge eder → buradaki
// değer çekirdeği ezer (ör. sipariş listesi "Tamamlama" → "Kargo durumu").
import tr from "./json/tr.json"

export default {
  tr: {
    translation: tr,
  },
}
