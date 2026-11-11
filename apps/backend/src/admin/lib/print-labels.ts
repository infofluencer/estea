/**
 * Etiket yazdırma — pencere tıklama anında açılır (popup engelleyici), içerik
 * yetkili fetch ile alınıp blob URL olarak yüklenir.
 *
 * DHL etiketi ZPL: önce `format=zpl` ile tek .zpl dosyası indirilir (yazıcıya doğrudan,
 * tam boy; kurulum docs/DHL-APIZONE.md → "Etiket baskısı (ZPL)"). PDF penceresi yalnız
 * fiş istenmişse ya da ZPL'i olmayan sipariş kaldıysa dolar; yoksa kapanır.
 */

async function errorMessage(res: Response): Promise<string> {
  try {
    const json = await res.json()
    return json?.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function skippedFrom(res: Response): string[] {
  const skipped = res.headers.get("X-Escay-Skipped")
  return skipped ? decodeURIComponent(skipped).split(", ").filter(Boolean) : []
}

function fileNameFrom(res: Response, fallback: string): string {
  const m = (res.headers.get("Content-Disposition") || "").match(/filename="?([^";]+)"?/)
  return m?.[1] || fallback
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * 1) ZPL etiketleri indir, 2) gerekirse PDF'i (fiş / ZPL'siz siparişler) pencerede aç.
 * Pencere tıklama anında açılır; PDF gerekmezse kapatılır.
 */
async function printLabels(basePath: string, withSlip: boolean): Promise<string[]> {
  const win = window.open("", "_blank")
  try {
    if (win) win.document.body.innerText = "Etiket hazırlanıyor…"
  } catch {
    // about:blank'e yazılamıyorsa yalnızca bekleme metni eksik kalır.
  }
  try {
    const zplRes = await fetch(`${basePath}&format=zpl`, { credentials: "include" })
    if (!zplRes.ok && zplRes.status !== 204) throw new Error(await errorMessage(zplRes))
    const zplCount = Number(zplRes.headers.get("X-Escay-Zpl-Count") || 0)
    const pdfCount = Number(zplRes.headers.get("X-Escay-Pdf-Count") || 0)
    if (zplRes.status === 200 && zplCount > 0) {
      download(await zplRes.blob(), fileNameFrom(zplRes, "dhl-etiket.zpl"))
    }
    if (!withSlip && pdfCount === 0) {
      win?.close()
      return skippedFrom(zplRes)
    }
    const pdfRes = await fetch(`${basePath}${withSlip ? "&slip=1" : ""}`, { credentials: "include" })
    if (pdfRes.status === 204) {
      win?.close()
      return skippedFrom(zplRes)
    }
    if (!pdfRes.ok) throw new Error(await errorMessage(pdfRes))
    const blobUrl = URL.createObjectURL(await pdfRes.blob())
    if (win) win.location.href = blobUrl
    else window.location.href = blobUrl
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    return [...new Set([...skippedFrom(zplRes), ...skippedFrom(pdfRes)])]
  } catch (error) {
    win?.close()
    throw error
  }
}

/**
 * Etiket PDF'i (her sipariş için kargo etiketi olduğu gibi; `withSlip` ise
 * arkasında sipariş fişi). Kargo etiketi alınamayan siparişleri döndürür
 * (uyarılı fişle basıldılar).
 */
export async function printOrderLabels(orderIds: string[], withSlip = false): Promise<string[]> {
  const ids = encodeURIComponent(orderIds.join(","))
  return printLabels(`/admin/escay-labels/orders?ids=${ids}`, withSlip)
}

/** Uyarı metni: kargo etiketi alınamayan siparişler. */
export function skippedLabelsMessage(skipped: string[]): string {
  return `Kargo etiketi henüz yok, yalnız fiş basıldı: ${skipped.join(", ")}. Etiket gelince tekrar basın ya da firmanın panelinden alın.`
}

/** Değişim gönderileri (yalnız yeni ürün): iade id'leri. */
export async function printExchangeLabels(keys: string[], withSlip = false): Promise<string[]> {
  const ids = encodeURIComponent(keys.join(","))
  return printLabels(`/admin/escay-labels/exchanges?ids=${ids}`, withSlip)
}
