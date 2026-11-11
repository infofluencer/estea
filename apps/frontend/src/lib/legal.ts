import { LEGAL_UPDATED_AT } from "@/lib/company"

export const LEGAL_PAGES = [
  {
    href: "/legal/mesafeli-satis-sozlesmesi",
    title: "Mesafeli Satış Sözleşmesi",
  },
  {
    href: "/legal/on-bilgilendirme-formu",
    title: "Ön Bilgilendirme Formu",
  },
  {
    href: "/legal/uyelik-sozlesmesi",
    title: "Üyelik Sözleşmesi",
  },
  {
    href: "/gizlilik-politikasi",
    title: "Gizlilik ve KVKK",
  },
  {
    href: "/iade-ve-geri-odeme-politikasi",
    title: "İade ve Cayma",
  },
  {
    href: "/legal/teslimat-ve-kargo",
    title: "Teslimat ve Kargo",
  },
  {
    href: "/cerez-politikasi",
    title: "Çerez Politikası",
  },
] as const

export { LEGAL_UPDATED_AT }

/**
 * Üyelik Sözleşmesi sürümü. Kayıtta müşterinin metadata'sına yazılır; hangi
 * üyenin hangi metni kabul ettiği buradan izlenir. Metin değişince sürüm ve
 * tarih birlikte güncellenir.
 *
 * Sürüm `-draft` ile bitiyorsa metin hukukçu onayı almamıştır (K5): sayfa arama
 * motorlarına kapalı tutulur ve sitemap'e girmez. Onaydan sonra eki kaldırın.
 */
export const MEMBERSHIP_TERMS = {
  version: "2026-11-11-draft",
  updatedAt: "11 Kasım 2026 (taslak)",
} as const

/** İade ve Teslimat sayfalarındaki son taahhüt değişikliği. */
export const POLICY_UPDATED_AT = "11 Kasım 2026 (taslak)"

export function isDraftLegalVersion(version: string): boolean {
  return version.endsWith("-draft")
}
