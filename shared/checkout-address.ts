/**
 * Checkout adres + fatura kimliği doğrulama — tek kaynak.
 *
 * Storefront form/aksiyonları ve backend completeCart hook'u aynı kuralları çalıştırır;
 * Store API'yi doğrudan çağıran istek de aynı süzgeçten geçer. Fatura metadata
 * anahtarları backend BizimHesap müşteri çözümü ile birebir hizalı:
 *   invoice_type | vkn | tckn | tax_office | company_name | district | neighbourhood | city_code
 */

import {
  isOfficialTrCityName,
  isValidTrPostalCode,
  normalizeTrPhone,
  normalizeTrPostalCode,
  trCityCodeForName,
} from "./tr-address"
import { isTrDistrictOf } from "./tr-districts"

/** Backend BizimHesap faturası: corporate → VKN + vergi dairesi müşteri kartına gider. */
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

/**
 * Sunucu tabanı ile mağaza sıkılığı arasındaki fark. Mağaza formu kargo etiketi için
 * mahalle ister; sunucu hook'u API'den gelen sepeti mahallesiz de kabul eder (fatura ve
 * kimlik kuralları her iki tarafta aynıdır).
 */
export type CheckoutAddressRules = {
  requireNeighbourhood?: boolean
  requireDistrict?: boolean
}

/** Yalnızca rakamlar. */
export function digitsOnly(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "")
}

/**
 * VKN: 10 hane + GİB kontrol basamağı.
 * i. basamak için t = (d + 9 − i) mod 10; t = 9 ise 9, değilse (t · 2^(9−i)) mod 9.
 * Toplamın 10'a tümleyeni son basamaktır.
 */
export function isValidVkn(value: string | null | undefined): boolean {
  const d = digitsOnly(value)
  if (d.length !== 10) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const t = (Number(d[i]) + 9 - i) % 10
    sum += t === 9 ? 9 : (t * 2 ** (9 - i)) % 9
  }
  return (10 - (sum % 10)) % 10 === Number(d[9])
}

/**
 * TCKN: 11 hane, ilk basamak 0 olamaz.
 * 10. basamak = ((tek sıralı ilk 5 toplamı · 7) − çift sıralı 4 toplamı) mod 10,
 * 11. basamak = ilk 10 basamağın toplamı mod 10.
 */
export function isValidTckn(value: string | null | undefined): boolean {
  const d = digitsOnly(value)
  if (d.length !== 11 || d[0] === "0") return false
  const n = d.split("").map(Number)
  const odd = n[0] + n[2] + n[4] + n[6] + n[8]
  const even = n[1] + n[3] + n[5] + n[7]
  const tenth = (((odd * 7 - even) % 10) + 10) % 10
  if (tenth !== n[9]) return false
  const eleventh = n.slice(0, 10).reduce((s, x) => s + x, 0) % 10
  return eleventh === n[10]
}

/** Karşılaştırma için: küçük harf, Türkçe karakter sadeleştirme, yalnız harf/rakam. */
function foldAddressText(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[ch] || ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
  input: CheckoutAddressInput,
  rules: CheckoutAddressRules = {}
): CheckoutAddressValidation {
  const requireNeighbourhood = rules.requireNeighbourhood ?? true
  const requireDistrict = rules.requireDistrict ?? true

  if (!input.first_name?.trim()) {
    return { ok: false, message: "Ad zorunlu.", field: "first_name" }
  }
  if (!input.last_name?.trim()) {
    return { ok: false, message: "Soyad zorunlu.", field: "last_name" }
  }
  if (!input.address_1?.trim()) {
    return { ok: false, message: "Adres zorunlu.", field: "address_1" }
  }

  const city = (input.city || "").trim()
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

  const district = (input.district || "").trim()
  if (!district && requireDistrict) {
    return { ok: false, message: "İlçe seçin.", field: "district" }
  }
  // Kargo firmaları ilçeyi isimle eşler; listede olmayan ad gönderi oluşturmayı bozar.
  if (district && !isTrDistrictOf(cityCode, district)) {
    return {
      ok: false,
      message: `${city} için listeden bir ilçe seçin.`,
      field: "district",
    }
  }

  const neighbourhood = (input.neighbourhood || "").trim()
  if (!neighbourhood && requireNeighbourhood) {
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
    if (vknDigits.length !== 10) {
      return {
        ok: false,
        message: "Kurumsal fatura için 10 haneli VKN girin.",
        field: "vkn",
      }
    }
    if (!isValidVkn(vknDigits)) {
      return {
        ok: false,
        message: "VKN doğrulanamadı; rakamları kontrol edin.",
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
  } else if (tcknDigits) {
    if (tcknDigits.length !== 11) {
      return {
        ok: false,
        message: "TCKN 11 haneli olmalıdır (veya boş bırakın).",
        field: "tckn",
      }
    }
    if (!isValidTckn(tcknDigits)) {
      return {
        ok: false,
        message: "TCKN doğrulanamadı; rakamları kontrol edin.",
        field: "tckn",
      }
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
 * Backend BizimHesap müşteri çözümü + kargo alanları ile birebir metadata.
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

/** Medusa adres kaydı (sepet / sipariş) — doğrulayıcı girdisine çevrilir. */
export type MedusaAddressLike = {
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  phone?: string | null
  country_code?: string | null
  metadata?: Record<string, unknown> | null
}

function metaText(meta: Record<string, unknown> | null | undefined, key: string): string {
  const v = meta?.[key]
  return typeof v === "string" ? v : ""
}

/**
 * İlçe metadata.district'te durur; province eski kayıtlarda ilçe, test betiklerinde il adı
 * taşır. İl adıyla aynıysa ilçe değildir.
 */
export function districtFromMedusaAddress(addr: MedusaAddressLike): string {
  const fromMeta = metaText(addr.metadata, "district").trim()
  if (fromMeta) return fromMeta
  const province = (addr.province || "").trim()
  return province && province !== (addr.city || "").trim() ? province : ""
}

/**
 * Sepetteki adresi doğrulayıcı girdisine çevirir. Mahalle metadata.neighbourhood ya da
 * address_2'de durur. Fatura kimliği yalnız billing metadata'sında yazılıdır.
 */
export function checkoutInputFromMedusaAddress(
  addr: MedusaAddressLike,
  opts: { withInvoiceIdentity?: boolean } = {}
): CheckoutAddressInput {
  const meta = addr.metadata || null
  const input: CheckoutAddressInput = {
    first_name: addr.first_name || "",
    last_name: addr.last_name || "",
    address_1: addr.address_1 || "",
    city: addr.city || "",
    district: districtFromMedusaAddress(addr),
    neighbourhood: metaText(meta, "neighbourhood") || addr.address_2 || "",
    postal_code: addr.postal_code || "",
    phone: addr.phone || "",
    country_code: addr.country_code || "tr",
  }
  if (opts.withInvoiceIdentity) {
    const type = metaText(meta, "invoice_type")
    input.invoice_type = type === "corporate" ? "corporate" : "individual"
    input.vkn = metaText(meta, "vkn") || metaText(meta, "tax_number")
    input.tckn = metaText(meta, "tckn") || metaText(meta, "identity_number")
    input.tax_office = metaText(meta, "tax_office")
    input.company_name = metaText(meta, "company_name")
  }
  return input
}
