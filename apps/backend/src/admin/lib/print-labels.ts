/**
 * Etiket yazdırma — pencere tıklama anında açılır (popup engelleyici), içerik
 * yetkili fetch ile alınıp blob URL olarak yüklenir.
 */

async function errorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json()
    return json?.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

async function openInNewWindow(url: string): Promise<Response> {
  const win = window.open("", "_blank")
  try {
    if (win) win.document.body.innerText = "Etiket hazırlanıyor…"
  } catch {
    // about:blank'e yazılamıyorsa yalnızca bekleme metni eksik kalır.
  }
  try {
    const res = await fetch(url, { credentials: "include" })
    if (!res.ok) throw new Error(await errorMessage(res))
    const blobUrl = URL.createObjectURL(await res.clone().blob())
    if (win) win.location.href = blobUrl
    else window.location.href = blobUrl
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    return res
  } catch (error) {
    win?.close()
    throw error
  }
}

function skippedFrom(res: Response): string[] {
  const skipped = res.headers.get("X-Escay-Skipped")
  return skipped ? decodeURIComponent(skipped).split(", ").filter(Boolean) : []
}

/**
 * Etiket PDF'i (her sipariş için kargo etiketi olduğu gibi; `withSlip` ise
 * arkasında sipariş fişi). Kargo etiketi alınamayan siparişleri döndürür
 * (uyarılı fişle basıldılar).
 */
export async function printOrderLabels(orderIds: string[], withSlip = false): Promise<string[]> {
  const ids = encodeURIComponent(orderIds.join(","))
  const slip = withSlip ? "&slip=1" : ""
  return skippedFrom(await openInNewWindow(`/admin/escay-labels/orders?ids=${ids}${slip}`))
}

/** Uyarı metni: kargo etiketi alınamayan siparişler. */
export function skippedLabelsMessage(skipped: string[]): string {
  return `Kargo etiketi alınamadı, yalnız fiş basıldı: ${skipped.join(", ")}. Firmanın etiketini kendi panelinden basın.`
}

/** Değişim gönderileri (yalnız yeni ürün): iade id'leri. */
export async function printExchangeLabels(keys: string[], withSlip = false): Promise<string[]> {
  const ids = encodeURIComponent(keys.join(","))
  const slip = withSlip ? "&slip=1" : ""
  return skippedFrom(await openInNewWindow(`/admin/escay-labels/exchanges?ids=${ids}${slip}`))
}
