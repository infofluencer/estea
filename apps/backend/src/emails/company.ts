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
   * Kodlu iadede müşterinin şubede söyleyeceği firma bilgisi (env). DHL'de:
   * RETURN_CARRIER_NAME="DHL eCommerce", RETURN_CUSTOMER_NUMBER=<DHL müşteri no>.
   */
  returnCarrierName: process.env.RETURN_CARRIER_NAME?.trim() || "anlaşmalı kargo firmamız",
  returnCustomerNumber: process.env.RETURN_CUSTOMER_NUMBER?.trim() || "",
} as const
