/**
 * Medusa adresi → taşıyıcı alıcı adresi (il/ilçe/telefon çözümleme).
 *
 * Saf tutulur: HTTP yok, container yok → token olmadan unit test edilir.
 * Türkçe karakterler ASCII'ye çevrilmez; firmalar UTF-8 kabul eder ve adres
 * eşleşmesi için doğru il/ilçe yazımına ihtiyaç duyar.
 */

import {
  normalizeTrPhone,
  resolveTrCity,
  resolveTrCityFromPostalCode,
} from "./tr-geo"
import type { Recipient, ShipmentItem } from "./types"

/** Medusa adres alanlarının mapping için gereken alt kümesi. */
export type MedusaAddressLike = {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
}

export type MedusaLineItemLike = {
  title?: string | null
  variant_title?: string | null
  variant_sku?: string | null
  quantity?: number | null
  unit_price?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * Mapping sonucu. Eksik zorunlu alanlar `missing` içinde toplanır; çağıran
 * taraf (provider service) buna bakıp anlamlı bir hata fırlatır ("İlçe eksik").
 */
export type MappingResult<T> = {
  value: T
  missing: string[]
  warnings: string[]
}

function cleanText(value?: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/\s+/g, " ").trim()
}

/** Ad soyad; ikisi de yoksa şirket adına düşer. */
export function buildRecipientName(address: MedusaAddressLike): string {
  const fullName = cleanText(`${cleanText(address.first_name)} ${cleanText(address.last_name)}`)
  return fullName || cleanText(address.company)
}

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
): string {
  if (!metadata) return ""
  for (const key of keys) {
    const value = cleanText(metadata[key])
    if (value) return value
  }
  return ""
}

export type MapRecipientOptions = {
  /** Checkout ilçe toplamıyorsa son çare. Boşsa uydurma yapılmaz, `missing`e eklenir. */
  defaultDistrict?: string
}

/**
 * İL (cityCode/cityName) öncelik sırası:
 *   1. metadata.city_code (checkout il seçici bunu yazar)
 *   2. province — ISO 3166-2 il alanı ("TR-34"/"34"/"İstanbul")
 *   3. city
 *   4. posta kodunun ilk iki hanesi (yalnız TR)
 *
 * İLÇE (districtName) öncelik sırası:
 *   1. metadata.district (checkout ilçe seçici)
 *   2. province — il olarak çözümlenMEdiyse
 *   3. address_2 — "Mahalle / İlçe" satırı
 *   4. city — il değilse
 * Hiçbiri yoksa `missing` içine "districtName" eklenir; uydurma yapılmaz.
 */
export function mapRecipientAddress(
  address: MedusaAddressLike,
  email: string,
  options: MapRecipientOptions = {}
): MappingResult<Recipient> {
  const missing: string[] = []
  const warnings: string[] = []

  const name = buildRecipientName(address)
  if (!name) missing.push("name")

  const normalizedEmail = cleanText(email)
  if (!normalizedEmail) missing.push("email")

  const phone = normalizeTrPhone(address.phone)
  if (!phone) {
    missing.push("phone")
    if (cleanText(address.phone)) {
      warnings.push(`Telefon TR formatına çevrilemedi: "${cleanText(address.phone)}"`)
    }
  }

  const address1 = cleanText(address.address_1)
  if (!address1) missing.push("address1")

  const countryCode = (cleanText(address.country_code) || "TR").toUpperCase()

  const provinceCity = resolveTrCity(address.province)
  const cityAsIl = resolveTrCity(address.city)
  const metadataCityCode = readMetadataString(address.metadata, ["city_code", "cityCode", "il_kodu"])

  // Posta kodu yedeği YALNIZCA TR adreslerinde: yabancı posta kodu yanlış ile eşleşebilir.
  const postalCodeCity = countryCode === "TR" ? resolveTrCityFromPostalCode(address.postal_code) : null

  const resolvedCity =
    resolveTrCity(metadataCityCode) || provinceCity || cityAsIl || postalCodeCity

  if (!resolvedCity) {
    missing.push("cityCode")
    warnings.push(
      `İl çözümlenemedi (city="${cleanText(address.city)}", province="${cleanText(address.province)}", postal_code="${cleanText(address.postal_code)}")`
    )
  }

  const provinceAsDistrict = provinceCity ? "" : cleanText(address.province)
  const cityAsDistrict = cityAsIl ? "" : cleanText(address.city)
  const defaultDistrict = cleanText(options.defaultDistrict)

  const districtFromAddress =
    readMetadataString(address.metadata, ["district", "district_name", "districtName", "ilce", "ilçe"]) ||
    provinceAsDistrict ||
    cleanText(address.address_2) ||
    cityAsDistrict

  const districtName = districtFromAddress || defaultDistrict

  if (!districtName) {
    missing.push("districtName")
    warnings.push(
      "İlçe bilgisi yok. Sipariş adresinin metadata.district alanı boş; checkout il→ilçe seçici bunu yazmalı."
    )
  } else if (!districtFromAddress) {
    warnings.push(`İlçe checkout'tan gelmedi; varsayılan ilçe "${defaultDistrict}" kullanıldı.`)
  }

  if (countryCode !== "TR") {
    warnings.push(`Ülke kodu "${countryCode}" — kargo entegrasyonu yurt içi (TR) için kuruldu.`)
  }

  // address_2'yi ilçe olarak kullandıysak adres satırında tekrarlamayız.
  const address2 = cleanText(address.address_2)
  const address2IsDistrict = address2 !== "" && address2 === districtName

  const value: Recipient = {
    name,
    email: normalizedEmail,
    phone: phone ?? "",
    address1,
    countryCode,
    cityName: resolvedCity?.cityName ?? cleanText(address.city),
    cityCode: resolvedCity?.cityCode ?? "",
    districtName,
  }
  if (address2 && !address2IsDistrict) value.address2 = address2
  const zip = cleanText(address.postal_code)
  if (zip) value.zip = zip

  return { value, missing, warnings }
}

/** Sipariş kalemlerini taşıyıcı kalem listesine çevirir (başlık + varyant, SKU, adet). */
export function mapItems(items: MedusaLineItemLike[]): ShipmentItem[] {
  return items.map((item) => {
    const title = cleanText(item.title) || "Ürün"
    const variant = cleanText(item.variant_title)
    const mapped: ShipmentItem = {
      title:
        variant && !/^default/i.test(variant) && !title.includes(variant)
          ? `${title} - ${variant}`
          : title,
      quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1),
    }
    const sku = cleanText(item.variant_sku)
    if (sku) mapped.sku = sku
    if (typeof item.unit_price === "number" && Number.isFinite(item.unit_price)) {
      mapped.unitPrice = item.unit_price
    }
    return mapped
  })
}
