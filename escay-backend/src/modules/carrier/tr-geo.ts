/**
 * Türkiye il (plaka) kodu çözümlemesi.
 *
 * Kargo firmaları `cityCode` (plaka, "34") + `cityName` ("İstanbul")
 * + `districtName` ("Kadıköy") ister. Medusa adresinde ise yalnızca
 * `city`, `province`, `postal_code` gibi serbest metin alanları var.
 *
 * İl listesi ve telefon normalizasyonu shared/tr-address.ts'ten gelir (tek kaynak).
 */

import {
  TR_CITIES,
  listTrCities,
  normalizeTrPhone,
  type TrCityOption,
} from "@escay/shared/tr-address"

export { TR_CITIES, listTrCities, normalizeTrPhone }
export type { TrCityOption }

/** Halk arasında yaygın kısaltmalar / eski adlar → plaka kodu. */
const TR_CITY_ALIASES: Record<string, string> = {
  afyon: "03",
  icel: "33",
  mersinicel: "33",
  kmaras: "46",
  maras: "46",
  kahramanmaras: "46",
  urfa: "63",
  sanliurfa: "63",
  antep: "27",
  gaziantep: "27",
  istanbulavrupa: "34",
  istanbulanadolu: "34",
  hakkâri: "30",
}

/**
 * Türkçe'ye duyarlı katlama (folding) — YALNIZCA EŞLEŞTİRME için.
 */
export function foldTr(value: string): string {
  return value
    .replace(/[İI]/g, "i")
    .replace(/ı/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u")
    .replace(/[Öö]/g, "o")
    .replace(/[Çç]/g, "c")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/** foldTr(il adı) → plaka kodu. Modül yüklenirken bir kez kurulur. */
const CITY_NAME_TO_CODE: Record<string, string> = (() => {
  const index: Record<string, string> = {}
  for (const [code, name] of Object.entries(TR_CITIES)) {
    index[foldTr(name)] = code
  }
  for (const [alias, code] of Object.entries(TR_CITY_ALIASES)) {
    index[foldTr(alias)] = code
  }
  return index
})()

export type ResolvedCity = {
  cityCode: string
  cityName: string
}

export function resolveTrCity(input?: string | null): ResolvedCity | null {
  if (!input) {
    return null
  }

  const raw = String(input).trim()
  if (!raw) {
    return null
  }

  const isoMatch = raw.match(/^(?:tr[-_\s]?)?(\d{1,2})$/i)
  if (isoMatch) {
    const code = isoMatch[1].padStart(2, "0")
    const name = TR_CITIES[code]
    return name ? { cityCode: code, cityName: name } : null
  }

  const code = CITY_NAME_TO_CODE[foldTr(raw)]
  return code ? { cityCode: code, cityName: TR_CITIES[code] } : null
}

export function resolveTrCityFromPostalCode(
  postalCode?: string | null
): ResolvedCity | null {
  if (!postalCode) {
    return null
  }

  const digits = String(postalCode).replace(/\D/g, "")
  if (digits.length !== 5) {
    return null
  }

  const code = digits.slice(0, 2)
  const name = TR_CITIES[code]
  return name ? { cityCode: code, cityName: name } : null
}
