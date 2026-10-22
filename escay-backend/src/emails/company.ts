/** Satıcı künyesi — storefront COMPANY ve shared/legal-contracts CONTRACT_SELLER ile aynı (mail şablonları). */
export const COMPANY = {
  legalName: "Hamzalı Çay Gıda Tur. ve İnş. A.Ş.",
  brand: "Es Çay",
  address: "Balaban Mah. Uğurlu Cad. No: 9, Merkez, Hayrat / Trabzon",
  phone: "0462 692 30 61",
  // TODO(K8): resmi operasyon / KVKK adresleri netleşince değiştir.
  emailOps: "info@esteacay.com",
  emailKvkk: "info@esteacay.com",
  /**
   * Kodlu iadede müşterinin şubede söyleyeceği firma bilgisi — TODO(K1):
   * kargo firması seçilince doldur (ör. "Aras Kargo", müşteri/cari no).
   */
  returnCarrierName: "anlaşmalı kargo firmamız",
  returnCustomerNumber: "",
} as const
