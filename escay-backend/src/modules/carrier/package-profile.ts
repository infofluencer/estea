/**
 * Paket profili — ürün ağırlık/boyut verisi olmadığında kullanılan varsayılan.
 *
 * NEDEN: Kargo firmaları gönderi oluştururken length/width/height (cm) ve weight (kg)
 * ZORUNLU ister. Es Çay kataloğunda şu an ürün/varyant ağırlığı ve boyutu YOK.
 * Bu yüzden config'te tek bir varsayılan koli profili tutulur ve sipariş
 * kalemlerinden okunabilen veri varsa onunla ezilir.
 *
 * İLERİYE DÖNÜK: ürün ağırlıkları girildiğinde tek yapılacak şey, sipariş
 * kalemi metadata'sına ağırlık/boyut yazmaktır — bu dosya değişmeden çalışır.
 */

export type PackageProfile = {
  /** Paket başına ağırlık, kg. */
  weight: number
  /** cm */
  length: number
  /** cm */
  width: number
  /** cm */
  height: number
  /**
   * Yükseklik, adet arttıkça büyür (paketler üst üste istiflenir) ama
   * bu değeri aşmaz. Kargo desi hesabının kontrolden çıkmasını engeller.
   */
  maxHeight: number
}

/**
 * Çay varsayılan kolisi — TODO(K1/K4): gerçek paketle ölç ve SHIPPING_PACKAGE_DEFAULT ile ez.
 * 30×20×15 cm → 3 desi; ağırlık 0,5 kg × adet (varyant metadata.weight_kg varsa o kullanılır).
 * maxHeight 45: koli adetle yükselir ama 3 koli boyunu aşmaz.
 */
export const DEFAULT_PACKAGE_PROFILE: PackageProfile = {
  weight: 0.5,
  length: 30,
  width: 20,
  height: 15,
  maxHeight: 45,
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

/**
 * SHIPPING_PACKAGE_DEFAULT env değerini ayrıştırır.
 *
 * Beklenen biçim (JSON):
 *   {"weight":0.5,"length":25,"width":20,"height":5,"maxHeight":40}
 *
 * Bozuk/eksik alanlar sessizce DEFAULT_PACKAGE_PROFILE'a düşer — hatalı bir
 * env değeri yüzünden kargo akışı kırılmaz.
 */
export function parsePackageProfile(raw?: string | null): PackageProfile {
  if (!raw || !raw.trim()) {
    return { ...DEFAULT_PACKAGE_PROFILE }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ...DEFAULT_PACKAGE_PROFILE }
  }

  if (!parsed || typeof parsed !== "object") {
    return { ...DEFAULT_PACKAGE_PROFILE }
  }

  return {
    weight: positiveNumber(parsed.weight) ?? DEFAULT_PACKAGE_PROFILE.weight,
    length: positiveNumber(parsed.length) ?? DEFAULT_PACKAGE_PROFILE.length,
    width: positiveNumber(parsed.width) ?? DEFAULT_PACKAGE_PROFILE.width,
    height: positiveNumber(parsed.height) ?? DEFAULT_PACKAGE_PROFILE.height,
    maxHeight:
      positiveNumber(parsed.maxHeight) ?? DEFAULT_PACKAGE_PROFILE.maxHeight,
  }
}

/** Paket hesabı için gereken minimum kalem bilgisi. */
export type PackageItemInput = {
  quantity?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * Kalem metadata'sından birim ağırlığı (kg) okur.
 *
 * Desteklenen anahtarlar (öncelik sırasıyla):
 *   - `weight_kg` → kilogram
 *   - `weight_g`  → gram
 *   - `weight`    → gram (Medusa varyantlarının yerleşik `weight` birimi)
 *
 * Birim belirsizliği bilerek anahtar adına taşındı; "weight" alanının gram
 * kabul edilmesi Medusa'nın kendi konvansiyonuyla uyumludur.
 */
export function readItemWeightKg(
  metadata?: Record<string, unknown> | null
): number | null {
  if (!metadata) {
    return null
  }

  const kg = positiveNumber(metadata.weight_kg)
  if (kg !== null) {
    return kg
  }

  const grams = positiveNumber(metadata.weight_g) ?? positiveNumber(metadata.weight)
  return grams !== null ? grams / 1000 : null
}

/** Kalem metadata'sından cm cinsinden boyut okur. */
function readItemDimensions(
  metadata?: Record<string, unknown> | null
): { length: number; width: number; height: number } | null {
  if (!metadata) {
    return null
  }

  const length = positiveNumber(metadata.length)
  const width = positiveNumber(metadata.width)
  const height = positiveNumber(metadata.height)

  if (length === null || width === null || height === null) {
    return null
  }

  return { length, width, height }
}

export type ResolvedPackage = {
  weight: number
  length: number
  width: number
  height: number
  /** Pakete giren toplam adet. */
  totalUnits: number
  /** Ağırlığın kalem verisinden mi yoksa varsayılandan mı geldiği. */
  weightSource: "items" | "default"
  dimensionsSource: "items" | "default"
}

/** İki ondalığa yuvarlar. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Sipariş kalemlerinden tek bir koli profili çıkarır.
 *
 * Ağırlık: her kalemin birim ağırlığı (metadata) × adet toplanır. Hiçbir kalemde
 * ağırlık yoksa profil ağırlığı × toplam adet kullanılır. Sonuç asla profildeki
 * minimumun altına inmez.
 *
 * Boyut: kalemlerde açık boyut varsa her eksende en büyüğü alınır, yoksa
 * profildeki koli kullanılır. Her iki durumda da yükseklik adet sayısıyla
 * doğru orantılı büyür (istifleme) ve `maxHeight` ile sınırlanır.
 */
export function resolvePackage(
  items: PackageItemInput[],
  profile: PackageProfile = DEFAULT_PACKAGE_PROFILE
): ResolvedPackage {
  const normalized = items.map((item) => ({
    quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1),
    metadata: item.metadata ?? null,
  }))

  const totalUnits = normalized.reduce((sum, item) => sum + item.quantity, 0) || 1

  let weightFromItems = 0
  let anyItemWeight = false

  let maxLength = 0
  let maxWidth = 0
  let maxHeight = 0
  let anyItemDimensions = false

  for (const item of normalized) {
    const unitWeight = readItemWeightKg(item.metadata)
    if (unitWeight !== null) {
      anyItemWeight = true
      weightFromItems += unitWeight * item.quantity
    } else {
      weightFromItems += profile.weight * item.quantity
    }

    const dimensions = readItemDimensions(item.metadata)
    if (dimensions) {
      anyItemDimensions = true
      maxLength = Math.max(maxLength, dimensions.length)
      maxWidth = Math.max(maxWidth, dimensions.width)
      maxHeight = Math.max(maxHeight, dimensions.height)
    }
  }

  const baseHeight = anyItemDimensions ? maxHeight : profile.height
  const stackedHeight = Math.min(baseHeight * totalUnits, profile.maxHeight)

  return {
    weight: round2(Math.max(weightFromItems, profile.weight)),
    length: round2(anyItemDimensions ? maxLength : profile.length),
    width: round2(anyItemDimensions ? maxWidth : profile.width),
    height: round2(stackedHeight),
    totalUnits,
    weightSource: anyItemWeight ? "items" : "default",
    dimensionsSource: anyItemDimensions ? "items" : "default",
  }
}
