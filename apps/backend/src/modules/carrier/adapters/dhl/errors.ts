/**
 * DHL Apizone hata gövdeleri ve sınıflandırma.
 *
 * Gelen biçimler (swagger + saha):
 *  - ProblemDetails (resmi 400/404): { type, title, status, detail, instance, errors? }
 *    `errors` ASP.NET doğrulama sözlüğü: { "Order.ReferenceId": ["…"] }
 *  - IBM API Connect geçidi: { httpCode, httpMessage, moreInformation }
 *    ("Cannot find valid subscription for the incoming API request" → abonelik yok)
 *  - MNG iş hatası: { error: { Code, Description } } | { code, description, errorType } | [ … ]
 *    Kod kataloğu: utilityapi/getapierrorcodes (`npm run dhl:error-codes`).
 *
 * Bilinen kodlar (resmi örnek + saha):
 *  20001 varış şubesi bulunamadı (sipariş açıldıktan ~30-50 sn / dakikalar sonra atanır)
 *  3002  aynı referenceId ile sipariş zaten var
 *  20013 Identity: sandbox anahtarı prod'da (ya da tersi)
 *  26056 alıcı vergi/TC no boş ya da hatalı
 *  26079 / 26105 alan doğrulama (errorType 4)
 */

export type DhlErrorKind =
  | "auth" // kimlik (müşteri no / şifre / JWT)
  | "subscription" // Apizone uygulamasında ürün aboneliği yok / onaysız
  | "forbidden" // 403 — IP yetkisi
  | "env_mismatch" // sandbox ↔ prod anahtar karışması
  | "branch_not_ready" // 20001
  | "order_exists" // 3002
  | "already_invoiced" // barkod zaten alınmış
  | "not_found" // 404 / kayıt yok
  | "validation" // 400 alan hataları
  | "rate_limited" // 429
  | "transient" // ağ / zaman aşımı / 5xx
  | "unknown"

/** Yol önekinden Apizone ürün adı (abonelik mesajı için). */
export function dhlProductOf(path: string): string {
  const p = path.replace(/^\//, "").split("/")[0].toLowerCase()
  return (
    {
      token: "Identity",
      refresh: "Identity",
      standardcmdapi: "Standard Command",
      standardqueryapi: "Standard Query",
      barcodecmdapi: "Barcode Command",
      pluscmdapi: "Plus Command",
      plusqueryapi: "Plus Query",
      cbsinfoapi: "CBS Info",
      bulkqueryapi: "Bulk Query",
      financequeryapi: "Finance Query",
      utilityapi: "Utility",
    } as Record<string, string>
  )[p] ?? p
}

export type ParsedDhlError = { code?: string; message: string; errorType?: number }

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim()
}

/** Hata gövdesinden kod + okunur mesaj (tüm bilinen biçimler). */
export function readDhlErrorBody(json: unknown): ParsedDhlError {
  if (typeof json === "string") return { message: json.slice(0, 500) }
  const root = Array.isArray(json) ? json[0] : json
  if (!root || typeof root !== "object") return { message: "" }
  const o = root as Record<string, unknown>

  // ASP.NET doğrulama sözlüğü
  const parts: string[] = []
  if (o.errors && typeof o.errors === "object" && !Array.isArray(o.errors)) {
    for (const [field, msgs] of Object.entries(o.errors as Record<string, unknown>)) {
      const list = Array.isArray(msgs) ? msgs.map(str) : [str(msgs)]
      parts.push(`${field}: ${list.filter(Boolean).join(", ")}`)
    }
  }

  for (const c of [o.error, o.Error, o]) {
    if (!c || typeof c !== "object") continue
    const e = c as Record<string, unknown>
    const code = str(e.Code ?? e.code ?? e.errorCode ?? e.ErrorCode)
    const message = [
      str(e.Description ?? e.description ?? e.message ?? e.Message),
      str(e.detail),
      str(e.moreInformation),
      str(e.title && !e.detail ? e.title : ""),
      ...parts,
    ]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" | ")
    const errorType = Number(e.errorType)
    // ProblemDetails/IBM'de "code" yok; httpCode zaten HTTP durumu.
    if (code || message) {
      return { code: code && code !== str(e.httpCode) ? code : undefined, message, errorType: Number.isFinite(errorType) ? errorType : undefined }
    }
  }
  return { message: parts.join(" | ") }
}

/** Hem Türkçe ("varış" → "VARIŞ") hem İngilizce ("subscription" → "SUBSCRIPTION", "İ" değil) büyük harf. */
const fold = (s: string) => `${s.toLocaleUpperCase("tr")} ${s.toUpperCase()}`

/** Kod + HTTP + metin → tür ve Türkçe çözüm ipucu. */
export function classifyDhlError(input: {
  code: string | null
  status: number | null
  path: string
  text?: string
}): { kind: DhlErrorKind; hint: string } {
  const code = input.code || ""
  const text = fold(input.text || "")
  const product = dhlProductOf(input.path)
  const isToken = /^\/?token/.test(input.path)

  if (code === "DHL_TIMEOUT" || code === "DHL_NETWORK") {
    return { kind: "transient", hint: "DHL'ye ulaşılamadı; ağ/zaman aşımı. Okumalar bir kez tekrarlanır." }
  }
  if (code === "20001" || text.includes("VARIŞ ŞUBESİ") || text.includes("VARIS SUBESI")) {
    return {
      kind: "branch_not_ready",
      hint: "Varış şubesi henüz atanmadı; aynı siparişle tekrar denenir. Saatlerce sürerse adres/ilçe DHL'de eşleşmiyor — entegrasyon.tr@dhl.com",
    }
  }
  const negated = /(DEĞİL|BULUNAMADI|YOK|NOT FOUND|NOT EXIST)/.test(text)
  if (
    code === "3002" ||
    (!negated &&
      /(ZATEN|DAHA ÖNCE|MEVCUT|ALREADY EXIST)/.test(text) &&
      /(REFERANS|SİPARİŞ|REFERENCE|ORDER)/.test(text) &&
      !/(FATURA|BARKOD|INVOICE)/.test(text))
  ) {
    return { kind: "order_exists", hint: "Bu referansla DHL'de sipariş zaten var; barkod adımına geçilir." }
  }
  if (
    !negated &&
    /(FATURALAŞ|FATURALAS|ZATEN BARKOD|ALREADY INVOICED|GÖNDERİLEŞ)/.test(text) &&
    !/(MAMIŞ|MEMİŞ|MAMIS|MEMIS)/.test(text)
  ) {
    return { kind: "already_invoiced", hint: "Sipariş zaten barkodlanmış (faturalaşmış); gönderi bilgisi sorgudan alınır." }
  }
  if (code === "20013") {
    return { kind: "env_mismatch", hint: "Sandbox anahtarı canlıda (ya da tersi) kullanılıyor: DHL_ENV ile DHL_CLIENT_ID/SECRET aynı ortamdan olmalı." }
  }
  if (code === "26056") {
    return { kind: "validation", hint: "Alıcı vergi/TC kimlik no boş ya da hatalı (11 hane TC / 10 hane VKN)." }
  }
  if (input.status === 401) {
    if (text.includes("SUBSCRIPTION") || text.includes("ABONE")) {
      return { kind: "subscription", hint: `Apizone uygulamasında "${product}" ürün aboneliği yok ya da onaylanmamış.` }
    }
    if (text.includes("CLIENT ID") || text.includes("CLIENT-ID") || text.includes("CLIENT SECRET")) {
      return { kind: "subscription", hint: "DHL_CLIENT_ID / DHL_CLIENT_SECRET geçersiz (Apizone uygulama anahtarları)." }
    }
    return {
      kind: "auth",
      hint: isToken
        ? "Müşteri no ya da şifre hatalı (DHL_CUSTOMER_NUMBER / DHL_PASSWORD = Online Şube kalıcı şifresi)."
        : "JWT geçersiz/süresi dolmuş; yenilenip bir kez tekrar denenir.",
    }
  }
  if (input.status === 403) {
    return { kind: "forbidden", hint: "Erişim reddedildi: sunucu çıkış IP'si DHL'e yetkilendirilmemiş olabilir ya da abonelik onay bekliyor." }
  }
  if (input.status === 404) return { kind: "not_found", hint: "DHL'de kayıt yok (henüz barkodlanmamış, iptal edilmiş ya da yanlış numara)." }
  if (input.status === 429) return { kind: "rate_limited", hint: "DHL istek sınırı aşıldı; okuma kısa süre sonra tekrarlanır." }
  if (input.status === 400) return { kind: "validation", hint: "DHL alanları reddetti; mesajdaki alanı düzeltin." }
  if (input.status && input.status >= 500) {
    // 20001 gibi iş hataları da 500 ile gelir; kodlu 500 iş hatasıdır, kodsuz 500 geçicidir.
    return code && /^\d+$/.test(code)
      ? { kind: "unknown", hint: `DHL iş hatası ${code} — kod kataloğu: npm run dhl:error-codes` }
      : { kind: "transient", hint: "DHL tarafında geçici hata." }
  }
  return { kind: "unknown", hint: "" }
}
