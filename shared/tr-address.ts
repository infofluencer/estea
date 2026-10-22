/**
 * TR adres verisi ve doğrulama — tek kaynak.
 *
 * Backend (carrier/tr-geo.ts / alıcı eşleme) ve storefront checkout bu modülü
 * paylaşır; il listesi veya telefon/posta kuralları iki yerde tutulmaz.
 */

/** 81 il — plaka kodu → resmi il adı (Türkçe karakterlerle). */
export const TR_CITIES: Record<string, string> = {
  "01": "Adana",
  "02": "Adıyaman",
  "03": "Afyonkarahisar",
  "04": "Ağrı",
  "05": "Amasya",
  "06": "Ankara",
  "07": "Antalya",
  "08": "Artvin",
  "09": "Aydın",
  "10": "Balıkesir",
  "11": "Bilecik",
  "12": "Bingöl",
  "13": "Bitlis",
  "14": "Bolu",
  "15": "Burdur",
  "16": "Bursa",
  "17": "Çanakkale",
  "18": "Çankırı",
  "19": "Çorum",
  "20": "Denizli",
  "21": "Diyarbakır",
  "22": "Edirne",
  "23": "Elazığ",
  "24": "Erzincan",
  "25": "Erzurum",
  "26": "Eskişehir",
  "27": "Gaziantep",
  "28": "Giresun",
  "29": "Gümüşhane",
  "30": "Hakkari",
  "31": "Hatay",
  "32": "Isparta",
  "33": "Mersin",
  "34": "İstanbul",
  "35": "İzmir",
  "36": "Kars",
  "37": "Kastamonu",
  "38": "Kayseri",
  "39": "Kırklareli",
  "40": "Kırşehir",
  "41": "Kocaeli",
  "42": "Konya",
  "43": "Kütahya",
  "44": "Malatya",
  "45": "Manisa",
  "46": "Kahramanmaraş",
  "47": "Mardin",
  "48": "Muğla",
  "49": "Muş",
  "50": "Nevşehir",
  "51": "Niğde",
  "52": "Ordu",
  "53": "Rize",
  "54": "Sakarya",
  "55": "Samsun",
  "56": "Siirt",
  "57": "Sinop",
  "58": "Sivas",
  "59": "Tekirdağ",
  "60": "Tokat",
  "61": "Trabzon",
  "62": "Tunceli",
  "63": "Şanlıurfa",
  "64": "Uşak",
  "65": "Van",
  "66": "Yozgat",
  "67": "Zonguldak",
  "68": "Aksaray",
  "69": "Bayburt",
  "70": "Karaman",
  "71": "Kırıkkale",
  "72": "Batman",
  "73": "Şırnak",
  "74": "Bartın",
  "75": "Ardahan",
  "76": "Iğdır",
  "77": "Yalova",
  "78": "Karabük",
  "79": "Kilis",
  "80": "Osmaniye",
  "81": "Düzce",
}

export type TrCityOption = {
  code: string
  name: string
}

/** Alfabetik sıralı 81 il — checkout dropdown için. */
export function listTrCities(): TrCityOption[] {
  return Object.entries(TR_CITIES)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"))
}

/** Resmi il adı mı (dropdown seçimi doğrulaması). */
export function isOfficialTrCityName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) {
    return false
  }
  return Object.values(TR_CITIES).includes(trimmed)
}

/** Resmi il adından plaka kodu. */
export function trCityCodeForName(name: string): string | null {
  const trimmed = name.trim()
  for (const [code, cityName] of Object.entries(TR_CITIES)) {
    if (cityName === trimmed) {
      return code
    }
  }
  return null
}

/**
 * Telefonu kargo firmalarının beklediği E.164 TR biçimine (+90XXXXXXXXXX) çevirir.
 *
 * Kabul: "0555 111 22 33", "+90 555...", "90555...", "5551112233".
 */
export function normalizeTrPhone(phone?: string | null): string | null {
  if (!phone) {
    return null
  }

  const digits = String(phone).replace(/\D/g, "")

  if (digits.length === 12 && digits.startsWith("90")) {
    return `+${digits}`
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+90${digits.slice(1)}`
  }
  if (digits.length === 10) {
    return `+90${digits}`
  }

  return null
}

/** 5 haneli TR posta kodu (00000 kabul edilmez). */
export function isValidTrPostalCode(postalCode?: string | null): boolean {
  if (!postalCode) {
    return false
  }
  const digits = String(postalCode).replace(/\D/g, "")
  if (digits.length !== 5 || digits === "00000") {
    return false
  }
  const cityCode = digits.slice(0, 2)
  return Boolean(TR_CITIES[cityCode])
}

export function normalizeTrPostalCode(postalCode: string): string {
  return String(postalCode).replace(/\D/g, "")
}
