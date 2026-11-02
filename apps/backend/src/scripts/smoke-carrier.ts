/**
 * Canlı anahtarla tek paketlik kargo duman testi — cutover'dan GÜNLER ÖNCE çalıştırılır.
 *
 * Mareen dersi: IP yetkisi, pasif hesap, teklif zaman aşımı, bakiye gibi hesap tarafı
 * engeller ilk gerçek gönderide çıktı. Bu script sırayla:
 *   1. healthCheck (varsa)        → hesap/bakiye/yetki
 *   2. createShipment             → tek koli, göndericinin kendi adresine, SMOKE referansı
 *   3. getStatus (varsa)          → durum sorgusu çalışıyor mu
 *   4. getLabel (varsa)           → resmi etiket PDF/ZPL geliyor mu (şube testi için yazdırın)
 *   5. cancelShipmentStrict/cancel→ kayıt firmada açık kalmasın
 *
 * Veritabanına DOKUNMAZ. Varsayılan: SHIPPING_CARRIER_TEST_MODE'a uyar (sandbox).
 *   npx medusa exec ./src/scripts/smoke-carrier.ts
 *   SMOKE_CARRIER_LIVE=1  → testMode=false (gerçek gönderi + ücret; sonunda iptal edilir)
 *   SMOKE_CARRIER_KEEP=1  → iptal ETME (şubeye götürüp etiketi test etmek için)
 *   SMOKE_RECIPIENT_JSON='{"name":"...","phone":"+90...","address1":"...","cityCode":"61","cityName":"Trabzon","districtName":"Hayrat","email":"..."}'
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import "../modules/carrier/adapters"
import { carrierTestMode, configuredCarrierCode, getConfiguredCarrier } from "../modules/carrier/registry"
import { carrierErrorText, type CreateShipmentInput, type Recipient } from "../modules/carrier/types"
import { DEFAULT_PACKAGE_PROFILE } from "../modules/carrier/package-profile"
import { COMPANY } from "../emails/company"

function defaultRecipient(): Recipient {
  const raw = process.env.SMOKE_RECIPIENT_JSON
  if (raw) return JSON.parse(raw) as Recipient
  return {
    name: `${COMPANY.brand} (SMOKE TEST)`,
    email: COMPANY.emailOps,
    phone: "+904626923061",
    address1: "Balaban Mah. Uğurlu Cad. No: 9",
    countryCode: "TR",
    cityCode: "61",
    cityName: "Trabzon",
    districtName: "Hayrat",
  }
}

export default async function smokeCarrier({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }
  const code = configuredCarrierCode()
  const adapter = getConfiguredCarrier()
  if (!adapter) {
    throw new Error(code ? `SHIPPING_CARRIER="${code}" için adaptör yok.` : "SHIPPING_CARRIER boş — test edilecek adaptör yok (elle kargo).")
  }
  const live = process.env.SMOKE_CARRIER_LIVE === "1"
  const testMode = live ? false : carrierTestMode()
  const keep = process.env.SMOKE_CARRIER_KEEP === "1"
  const started = Date.now()
  const step = (name: string, extra = "") => logger.info(`[smoke-carrier] ${name}${extra ? ` — ${extra}` : ""} (+${Date.now() - started} ms)`)

  logger.info(`[smoke-carrier] ${adapter.name} (${adapter.code}) testMode=${testMode} ${live ? "CANLI ANAHTAR, gerçek gönderi" : "sandbox"}`)

  if (adapter.healthCheck) {
    const h = await adapter.healthCheck()
    step("healthCheck", `ok=${h.ok} bakiye=${h.balance ?? "-"} uyarı=${h.warnings.length ? h.warnings.join(" | ") : "yok"}`)
    if (!h.ok) throw new Error("Hesap kontrolü başarısız — gönderi denemesi yapılmadı.")
  } else {
    step("healthCheck", "adaptörde yok, atlandı")
  }

  const reference = `${(process.env.ORDER_REF_PREFIX ?? "ESC-").trim()}SMOKE-${Date.now().toString(36).toUpperCase()}`
  const input: CreateShipmentInput = {
    order: { id: "smoke", displayId: reference, reference, isExchange: false, currencyCode: "TRY", total: 1 },
    recipient: defaultRecipient(),
    parcel: {
      weight: DEFAULT_PACKAGE_PROFILE.weight,
      length: DEFAULT_PACKAGE_PROFILE.length,
      width: DEFAULT_PACKAGE_PROFILE.width,
      height: DEFAULT_PACKAGE_PROFILE.height,
    },
    items: [{ title: "Smoke test paketi", sku: "SMOKE", quantity: 1, unitPrice: 1 }],
    testMode,
  }

  let data: Record<string, unknown>
  try {
    const created = await adapter.createShipment(input)
    data = { carrier: adapter.code, ...created.data }
    step("createShipment", `ref=${String(data.shipment_ref ?? "?")} takip=${String(data.tracking_number ?? "-")} etiket=${created.labels.length}`)
  } catch (error) {
    logger.error(`[smoke-carrier] createShipment BAŞARISIZ: ${carrierErrorText(error)}`)
    throw error
  }

  const outcome: Record<string, string> = {}
  if (adapter.getStatus) {
    try {
      const s = await adapter.getStatus(data)
      step("getStatus", `${s.code} → ${s.action} (${s.description})`)
      outcome.status = "ok"
    } catch (error) {
      logger.warn(`[smoke-carrier] getStatus hata: ${carrierErrorText(error)}`)
      outcome.status = "hata"
    }
  }
  if (adapter.getLabel) {
    try {
      const label = await adapter.getLabel(data, "pdf")
      const file = join(process.cwd(), `smoke-carrier-label-${Date.now()}.pdf`)
      writeFileSync(file, typeof label === "string" ? Buffer.from(label, "base64") : label)
      step("getLabel", `yazıldı: ${file} — şubede kabul testi için yazdırın`)
      outcome.label = "ok"
    } catch (error) {
      logger.warn(`[smoke-carrier] getLabel hata: ${carrierErrorText(error)}`)
      outcome.label = "hata"
    }
  }

  if (keep) {
    logger.warn(`[smoke-carrier] SMOKE_CARRIER_KEEP=1 — gönderi firmada AÇIK bırakıldı (ref ${String(data.shipment_ref)}). Şube testi sonrası elle iptal edin.`)
  } else {
    try {
      if (adapter.cancelShipmentStrict) await adapter.cancelShipmentStrict(data)
      else await adapter.cancelShipment(data)
      step("cancelShipment", "iptal edildi")
      outcome.cancel = "ok"
    } catch (error) {
      logger.error(`[smoke-carrier] İPTAL BAŞARISIZ — firmada açık kayıt: ${String(data.shipment_ref)}: ${carrierErrorText(error)}`)
      outcome.cancel = "hata"
    }
  }

  const failed = Object.values(outcome).includes("hata")
  logger.info(`[smoke-carrier] SONUÇ ${failed ? "SORUNLU" : "TEMİZ"} ${JSON.stringify(outcome)}`)
  if (failed) throw new Error("smoke-carrier: bir ya da daha fazla adım başarısız (yukarıdaki log).")
}
