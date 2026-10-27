/**
 * Checkout adres + fatura kimliği doğrulama.
 * Fatura metadata anahtarları backend extractTaxNumber ile birebir hizalı:
 *   vkn | tckn | tax_number | identity_number
 */

import {
  isOfficialTrCityName,
  isValidTrPostalCode,
  normalizeTrPhone,
  normalizeTrPostalCode,
  trCityCodeForName,
} from "@escay/shared/tr-address"
import { isTrDistrictOf } from "@escay/shared/tr-districts"

export { listTrDistricts } from "@escay/shared/tr-districts"
export { listTrCities, type TrCityOption } from "@escay/shared/tr-address"

/** Backend Parasut: individual → e_archive yolu; corporate → VKN ile e_invoice kontrolü. */
export type CheckoutInvoiceType = "individual" | "corporate"

export type CheckoutAddressInput = {
  first_name: string
  last_name: string
  address_1: string
  city: string
  district: string
  /** Mahalle → address_2 + metadata.neighbourhood (kargo etiketinde address2) */
  neighbourhood: string
  postal_code: string
  phone: string
  country_code?: string
  /** Bireysel default / kurumsal */
  invoice_type?: CheckoutInvoiceType
  /** Kurumsal: 10 hane VKN → billing.metadata.vkn */
  vkn?: string
  /** Bireysel opsiyonel: 11 hane TCKN → billing.metadata.tckn */
  tckn?: string
  /** Kurumsal zorunlu → billing.metadata.tax_office */
  tax_office?: string
  /** Kurumsal zorunlu unvan → billing.metadata.company_name. Bireyselde yok. */
  company_name?: string
}

export type CheckoutAddressField =
  | "first_name"
  | "last_name"
  | "address_1"
  | "city"
  | "district"
  | "neighbourhood"
  | "postal_code"
  | "phone"
  | "vkn"
  | "tckn"
  | "tax_office"
  | "company_name"
  | "invoice_type"

export type CheckoutAddressValidation =
  | {
      ok: true
      normalized: CheckoutAddressInput & {
        city_code: string
        invoice_type: CheckoutInvoiceType
      }
    }
  | { ok: false; message: string; field: CheckoutAddressField }

/** Yalnızca rakamlar. */
export function digitsOnly(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "")
}

export function isValidVkn(value: string | null | undefined): boolean {
  return digitsOnly(value).length === 10
}

export function isValidTckn(value: string | null | undefined): boolean {
  return digitsOnly(value).length === 11
}

/** Karşılaştırma için: küçük harf, Türkçe karakter sadeleştirme, yalnız harf/rakam. */
function foldAddressText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[ch] || ch)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const ADDRESS_FILLER_WORDS = new Set([
  "mahallesi",
  "mahalle",
  "mah",
  "mh",
  "turkiye",
  "turkey",
])

const ADDRESS_UNIT_WORDS = new Set([
  "no",
  "numara",
  "kat",
  "daire",
  "blok",
  "apt",
  "apartman",
  "apartmani",
  "ic",
  "kapi",
  "dis",
])

const ADDRESS_STREET_WORDS = new Set([
  "sk",
  "sok",
  "sokak",
  "sokagi",
  "cd",
  "cad",
  "cadde",
  "caddesi",
  "blv",
  "bul",
  "bulv",
  "bulvar",
  "bulvari",
])

type AddressLineContext = {
  neighbourhood?: string
  district?: string
  city?: string
}

/** Açık adresten ayrıca seçilen mahalle/ilçe/il adları ve "mahallesi" atılmış kelimeler. */
function addressLineExtraWords(line: string, context: AddressLineContext): string[] {
  const known = new Set(
    [context.neighbourhood, context.district, context.city]
      .flatMap((part) => foldAddressText(part || "").split(" "))
      .filter(Boolean)
  )
  return foldAddressText(line)
    .split(" ")
    .filter((word) => word && !known.has(word) && !ADDRESS_FILLER_WORDS.has(word))
}

/**
 * Kesin hata: açık adres satırında ayrıca seçilmiş mahalle/ilçe/il adlarından
 * başka hiçbir şey yok ("Yunuseli Mahallesi"). Böyle bir adres asla doğru
 * olamaz → checkout engellenir (#14, 2026-10-07).
 */
export function isAddressLineOnlyLocation(
  line: string,
  context: AddressLineContext = {}
): boolean {
  return addressLineExtraWords(line, context).length === 0
}

/**
 * Şüpheli ama olası doğru: numara yok veya sokak/cadde/site adı görünmüyor.
 * Engellenmez; müşteriye "adres doğru mu?" diye sorulur.
 */
export function isAddressLineSuspicious(
  line: string,
  context: AddressLineContext = {}
): boolean {
  const words = addressLineExtraWords(line, context)
  const numbers = words.filter((word) => /\d/.test(word))
  const hasNamedPlace = words.some(
    (word) =>
      /^[a-z]{3,}$/.test(word) &&
      !ADDRESS_UNIT_WORDS.has(word) &&
      !ADDRESS_STREET_WORDS.has(word)
  )
  // Numaralı sokak: "1453 Sk. No:5" → sokak kelimesi + sokak no + bina no.
  const hasNumberedStreet =
    words.some((word) => ADDRESS_STREET_WORDS.has(word)) && numbers.length >= 2
  return numbers.length === 0 || !(hasNamedPlace || hasNumberedStreet)
}

export const ADDRESS_LINE_HINT =
  "Açık adres alanına cadde/sokak ve bina-daire numarasını yazın (ör. Atatürk Cad. No:12 D:3). Mahalle, ilçe ve il ayrıca seçiliyor."

/**
 * Adres + fatura kimliği.
 * Bireysel: TCKN opsiyonel; company_name yazılmaz.
 * Kurumsal: VKN + vergi dairesi + unvan zorunlu.
 */
export function validateCheckoutAddress(
  input: CheckoutAddressInput
): CheckoutAddressValidation {
  if (!input.first_name?.trim()) {
    return { ok: false, message: "Ad zorunlu.", field: "first_name" }
  }
  if (!input.last_name?.trim()) {
    return { ok: false, message: "Soyad zorunlu.", field: "last_name" }
  }
  if (!input.address_1?.trim()) {
    return { ok: false, message: "Adres zorunlu.", field: "address_1" }
  }

  const city = input.city.trim()
  if (!city) {
    return { ok: false, message: "İl seçin.", field: "city" }
  }
  if (!isOfficialTrCityName(city)) {
    return { ok: false, message: "Geçerli bir il seçin.", field: "city" }
  }

  const cityCode = trCityCodeForName(city)
  if (!cityCode) {
    return { ok: false, message: "Geçerli bir il seçin.", field: "city" }
  }

  const district = input.district.trim()
  if (!district) {
    return { ok: false, message: "İlçe seçin.", field: "district" }
  }
  // Kargo firmaları ilçeyi isimle eşler; listede olmayan ad gönderi oluşturmayı bozar.
  if (!isTrDistrictOf(cityCode, district)) {
    return {
      ok: false,
      message: `${city} için listeden bir ilçe seçin.`,
      field: "district",
    }
  }

  const neighbourhood = (input.neighbourhood || "").trim()
  if (!neighbourhood) {
    return { ok: false, message: "Mahalle seçin.", field: "neighbourhood" }
  }

  if (isAddressLineOnlyLocation(input.address_1, { neighbourhood, district, city })) {
    return { ok: false, message: ADDRESS_LINE_HINT, field: "address_1" }
  }

  const postal = normalizeTrPostalCode(input.postal_code || "")
  if (!isValidTrPostalCode(postal)) {
    return {
      ok: false,
      message: "Posta kodu 5 haneli olmalıdır.",
      field: "postal_code",
    }
  }

  const phone = normalizeTrPhone(input.phone)
  if (!phone) {
    return {
      ok: false,
      message: "Geçerli bir telefon numarası girin.",
      field: "phone",
    }
  }

  const invoiceType: CheckoutInvoiceType =
    input.invoice_type === "corporate" ? "corporate" : "individual"

  const vknDigits = digitsOnly(input.vkn)
  const tcknDigits = digitsOnly(input.tckn)
  const taxOffice = (input.tax_office || "").trim()
  const companyName = (input.company_name || "").trim()

  if (invoiceType === "corporate") {
    if (!isValidVkn(vknDigits)) {
      return {
        ok: false,
        message: "Kurumsal fatura için 10 haneli VKN girin.",
        field: "vkn",
      }
    }
    if (!taxOffice) {
      return {
        ok: false,
        message: "Kurumsal fatura için vergi dairesi zorunlu.",
        field: "tax_office",
      }
    }
    if (!companyName) {
      return {
        ok: false,
        message: "Kurumsal fatura için şirket unvanı zorunlu.",
        field: "company_name",
      }
    }
  } else if (tcknDigits && !isValidTckn(tcknDigits)) {
    return {
      ok: false,
      message: "TCKN 11 haneli olmalıdır (veya boş bırakın).",
      field: "tckn",
    }
  }

  return {
    ok: true,
    normalized: {
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      address_1: input.address_1.trim(),
      city,
      district,
      neighbourhood,
      postal_code: postal,
      phone,
      country_code: (input.country_code || "tr").toLowerCase(),
      city_code: cityCode,
      invoice_type: invoiceType,
      vkn: invoiceType === "corporate" ? vknDigits : undefined,
      tckn:
        invoiceType === "individual" && tcknDigits ? tcknDigits : undefined,
      tax_office: invoiceType === "corporate" ? taxOffice : undefined,
      company_name:
        invoiceType === "corporate" && companyName ? companyName : undefined,
    },
  }
}

/**
 * Backend extractTaxNumber + contact alanları ile birebir metadata.
 * Yazılan anahtarlar: invoice_type, vkn?, tckn?, tax_office?, company_name?,
 * district, neighbourhood, city_code, email?
 */
export function buildBillingInvoiceMetadata(
  normalized: CheckoutAddressInput & {
    city_code: string
    invoice_type: CheckoutInvoiceType
  },
  email?: string
): Record<string, string> {
  const meta: Record<string, string> = {
    district: normalized.district,
    neighbourhood: normalized.neighbourhood,
    city_code: normalized.city_code,
    invoice_type: normalized.invoice_type,
  }
  if (email?.trim()) {
    meta.email = email.trim()
  }
  if (normalized.invoice_type === "corporate") {
    if (normalized.vkn) meta.vkn = normalized.vkn
    if (normalized.tax_office) meta.tax_office = normalized.tax_office
    if (normalized.company_name) meta.company_name = normalized.company_name
  } else if (normalized.tckn) {
    meta.tckn = normalized.tckn
  }
  return meta
}

export { normalizeTrPhone, isValidTrPostalCode, isOfficialTrCityName }
