/**
 * Checkout adres + fatura kimliği doğrulama.
 * Kurallar shared/checkout-address.ts'te; backend completeCart hook'u aynı modülü çalıştırır.
 */

export {
  ADDRESS_LINE_HINT,
  buildBillingInvoiceMetadata,
  digitsOnly,
  isAddressLineOnlyLocation,
  isAddressLineSuspicious,
  isValidTckn,
  isValidVkn,
  validateCheckoutAddress,
  type CheckoutAddressField,
  type CheckoutAddressInput,
  type CheckoutAddressRules,
  type CheckoutAddressValidation,
  type CheckoutInvoiceType,
} from "@escay/shared/checkout-address"

export { listTrDistricts } from "@escay/shared/tr-districts"
export {
  isOfficialTrCityName,
  isValidTrPostalCode,
  listTrCities,
  normalizeTrPhone,
  type TrCityOption,
} from "@escay/shared/tr-address"
