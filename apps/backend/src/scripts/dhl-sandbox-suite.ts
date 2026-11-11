/**
 * DHL sandbox senaryo takımı — adaptörün bütün işlemlerini GERÇEK sandbox API'sinde dener.
 * Yalnız sandbox'ta çalışır (DHL_ENV=prod ise reddeder). Veritabanına dokunmaz; açtığı her
 * kaydı sonunda iptal eder. Ham yanıtlar rapora yazılır (docs/DHL-APIZONE.md teyit listesi).
 *
 *   npm run dhl:sandbox-suite
 *   DHL_SUITE_OUT=/yol/rapor.json  → ham yanıtlarla JSON rapor
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { writeFileSync } from "node:fs"
import { createDhlAdapter, missingDhlCredentials, readDhlOptions } from "../modules/carrier/adapters/dhl"
import { DhlClient } from "../modules/carrier/adapters/dhl/client"
import { buildCreateOrderBody, buildParty, DHL_ENUM } from "../modules/carrier/adapters/dhl/shipment"
import { DEFAULT_PACKAGE_PROFILE } from "../modules/carrier/package-profile"
import { carrierErrorText, CarrierError, type CreateShipmentInput, type Recipient } from "../modules/carrier/types"

type Row = { name: string; ok: boolean; note: string; ms: number }

const base: Recipient = {
  name: "Es Cay Sandbox Test",
  email: "test@example.com",
  phone: "+905551231212",
  address1: "Balaban Mah. Uğurlu Cad. No: 9",
  countryCode: "TR",
  cityCode: "61",
  cityName: "Trabzon",
  districtName: "Hayrat",
}

export default async function dhlSandboxSuite({ container }: ExecArgs) {
  const logger = container.resolve("logger") as { info: (m: string) => void; warn: (m: string) => void }
  const o = readDhlOptions()
  if (o.env !== "sandbox") throw new Error("dhl-sandbox-suite yalnız sandbox'ta çalışır (DHL_ENV=prod).")
  const missing = missingDhlCredentials(o)
  if (missing.length) throw new Error(`DHL kimlikleri eksik: ${missing.join(", ")}`)

  const quiet = { info: (m: string) => logger.info(m), warn: (m: string) => logger.warn(m) }
  const adapter = createDhlAdapter({ logger: quiet })
  const client = new DhlClient(o)
  const rows: Row[] = []
  const raw: Record<string, unknown> = {}
  /** Sonunda iptal edilecek kayıtlar (fulfillment data biçiminde). */
  const cleanup: Record<string, unknown>[] = []
  const stamp = Date.now().toString(36).toUpperCase()
  const parcel = {
    weight: DEFAULT_PACKAGE_PROFILE.weight,
    length: DEFAULT_PACKAGE_PROFILE.length,
    width: DEFAULT_PACKAGE_PROFILE.width,
    height: DEFAULT_PACKAGE_PROFILE.height,
  }

  const input = (reference: string, recipient: Recipient = base, extra: Partial<CreateShipmentInput["order"]> = {}): CreateShipmentInput => ({
    order: { id: "suite", displayId: reference, reference, isExchange: false, currencyCode: "TRY", total: 1, ...extra },
    recipient,
    parcel,
    items: [{ title: "Sandbox test", sku: "TEST", quantity: 1, unitPrice: 1 }],
    testMode: true,
  })

  async function step(name: string, fn: () => Promise<string>) {
    const t = Date.now()
    try {
      const note = await fn()
      rows.push({ name, ok: true, note, ms: Date.now() - t })
      logger.info(`[suite] ✓ ${name} — ${note} (${Date.now() - t} ms)`)
    } catch (error) {
      const note = carrierErrorText(error).slice(0, 700)
      rows.push({ name, ok: false, note, ms: Date.now() - t })
      logger.warn(`[suite] ✗ ${name} — ${note} (${Date.now() - t} ms)`)
    }
  }
  const rawCall = async (key: string, fn: () => Promise<unknown>) => {
    try {
      raw[key] = await fn()
    } catch (error) {
      raw[key] = { error: (error as Error).message, context: (error as CarrierError).context ?? null }
    }
    return raw[key]
  }
  const expectError = async (fn: () => Promise<unknown>, code?: string) => {
    try {
      await fn()
    } catch (error) {
      const c = (error as CarrierError).code
      if (code && c !== code) throw new Error(`beklenen ${code}, gelen ${c}: ${(error as Error).message}`)
      return `${c}: ${(error as Error).message}`.slice(0, 260)
    }
    throw new Error("hata bekleniyordu, başarılı oldu")
  }

  // ── 1. Hesap ──
  await step("1 healthCheck", async () => {
    const h = await adapter.healthCheck!()
    if (!h.ok) throw new Error(h.warnings.join(" | "))
    return `uyarı: ${h.warnings.join(" | ") || "yok"}`
  })

  // ── 2. Normal gönderi ──
  const refA = `ESC-T${stamp}A`
  let a: Record<string, unknown> = {}
  await step("2 normal gönderi (alıcı ön kaydı → sipariş → barkod)", async () => {
    const r = await adapter.createShipment(input(refA))
    a = { carrier: "dhl", order_reference: refA, test_mode: true, ...r.data }
    cleanup.push(a)
    if (a.dhl_barcode_pending) return `ETİKET BEKLİYOR (${String(a.dhl_barcode_last_error)})`
    const zpl = String(a.label_zpl ?? "")
    if (!zpl.startsWith("^XA")) throw new Error("etiket ZPL değil")
    return `ref=${String(a.shipment_ref)} gönderi=${String(a.tracking_number)} barkod=${String(a.barcode)} deneme=${String(a.dhl_barcode_attempts)} önkayıt=${String(a.dhl_recipient_pre_registered)} bölge=${String(a.dhl_service_area)} zpl=${zpl.length}b`
  })

  await step("3 aynı sipariş tekrar (çift kayıt açılmamalı)", async () => {
    const r = await adapter.createShipment(input(refA))
    const same = String(r.data.dhl_shipment_id ?? "") === String(a.dhl_shipment_id ?? "")
    if (!same) throw new Error(`farklı gönderi no: ${String(r.data.dhl_shipment_id)} ≠ ${String(a.dhl_shipment_id)}`)
    return `aynı gönderi no, zaten_vardı=${String(r.data.dhl_order_already_existed)} etiket_kayıp=${String(r.data.dhl_label_missing)}`
  })

  await step("4 durum sorgusu", async () => {
    const s = await adapter.getStatus!(a)
    await rawCall("getshipmentstatus", () => client.getShipmentStatus(String(a.shipment_ref)))
    await rawCall("getshipment", () => client.getShipment(String(a.shipment_ref)))
    await rawCall("trackshipment", () => client.trackShipment(String(a.shipment_ref)))
    await rawCall("getorder", () => client.getOrder(String(a.shipment_ref)))
    await rawCall("getshipmentstatusByShipmentId", () => client.getShipmentStatusByShipmentId(String(a.dhl_shipment_id)))
    return `${s.code} → ${s.action} (${s.description}) takip_linki=${String(s.patch?.tracking_url ?? "değişmedi")}`
  })

  await step("5 dış gönderi gibi: yalnız gönderi no ile durum", async () => {
    const s = await adapter.getStatus!({ carrier: "dhl", shipment_ref: a.dhl_shipment_id, tracking_number: a.dhl_shipment_id })
    return `${s.code} → ${s.action} (${s.description})`
  })

  await step("6 etiket (ZPL)", async () => {
    const zpl = String(await adapter.getLabel!(a, "zpl"))
    const pw = zpl.match(/\^PW(\d+)/)?.[1]
    const ll = zpl.match(/\^LL(\d+)/)?.[1]
    raw.label_size_dots = { pw, ll }
    return `genişlik ${pw} nokta, boy ${ll} nokta (203 dpi → ${(Number(pw) / 80).toFixed(1)} × ${(Number(ll) / 80).toFixed(1)} cm)`
  })

  // ── 3. İade ──
  let returnRef = ""
  await step("7 kodlu iade", async () => {
    const r = await adapter.createReturn!(a, `ret_${stamp}`)
    returnRef = String(r.returnCode ?? "")
    raw.createReturn = r
    return `kod=${returnRef} etiket_linki=${r.labelUrl ?? "YOK"}`
  })
  await step("8 aynı iade tekrar (aynı kod)", async () => {
    const r = await adapter.createReturn!(a, `ret_${stamp}`)
    if (String(r.returnCode) !== returnRef) throw new Error(`farklı kod ${String(r.returnCode)}`)
    return `aynı kod, zaten_vardı=${String(r.data?.dhl_return_existed)}`
  })
  await step("9 iade siparişi durumu / iptali", async () => {
    await rawCall("return_getorder", () => client.getOrder(returnRef))
    const c = await rawCall("return_cancelorder", () => client.cancelOrder(returnRef))
    return JSON.stringify(c).slice(0, 200)
  })

  // ── 4. İptal ──
  await step("10 barkodlu gönderi iptali (kesin)", async () => {
    await adapter.cancelShipmentStrict!(a)
    return "iptal edildi"
  })
  await step("11 iptal sonrası durum (bulunamadı beklenir)", async () => {
    const s = await adapter.getStatus!(a)
    return `${s.code} (${s.description})${s.alert ? ` uyarı: ${s.alert.title}` : ""}`
  })
  await step("12 iptal edilmişi tekrar iptal (hata vermemeli)", async () => {
    const r = await adapter.cancelShipment(a)
    return JSON.stringify(r).slice(0, 200)
  })

  // ── 5. Yeniden gönderim / değişim ──
  await step("13 reship: iptal edilen referans yerine yenisi", async () => {
    const r = await adapter.createShipment(input(refA, base, { canceledShipmentRefs: [String(a.shipment_ref)] }))
    const d = { carrier: "dhl", order_reference: refA, ...r.data }
    cleanup.push(d)
    if (String(d.shipment_ref) === String(a.shipment_ref)) throw new Error("aynı referans kullanıldı")
    return `yeni ref=${String(d.shipment_ref)} gönderi=${String(d.tracking_number ?? "-")} bekliyor=${String(Boolean(d.dhl_barcode_pending))}`
  })
  await step("14 değişim gönderisi (ESC-…-D)", async () => {
    const r = await adapter.createShipment(input(`${refA}-D`, base, { isExchange: true }))
    const d = { carrier: "dhl", order_reference: `${refA}-D`, ...r.data }
    cleanup.push(d)
    return `ref=${String(d.shipment_ref)} gönderi=${String(d.tracking_number ?? "-")}`
  })

  // ── 6. Barkodsuz sipariş iptali ──
  await step("15 barkodsuz sipariş → iptal", async () => {
    const ref = `ESCT${stamp}N`
    const party = buildParty(base, { cityCode: 61, districtCode: 0 }, "test@example.com")
    raw.createOrder_only = await client.createOrder(
      buildCreateOrderBody({
        referenceId: ref,
        party,
        parcel,
        content: "Sandbox test",
        deliveryType: DHL_ENUM.deliveryType.toAddress,
        paymentType: DHL_ENUM.paymentType.senderPays,
        sms: [0, 0, 0],
      })
    )
    const d = { carrier: "dhl", dhl_reference_id: ref, shipment_ref: ref }
    cleanup.push(d)
    await rawCall("status_before_barcode", () => client.getShipmentStatus(ref))
    await adapter.cancelShipmentStrict!(d)
    return `sipariş açıldı ve iptal edildi (${ref})`
  })

  // ── 7. Farklı adresler ──
  const addresses: [string, Recipient][] = [
    ["16 büyükşehir adresi (İstanbul/Kadıköy)", { ...base, cityCode: "34", cityName: "İstanbul", districtName: "Kadıköy", address1: "Caferağa Mah. Moda Cad. No: 1 D: 2", neighbourhood: "Caferağa" }],
    ["17 il adı plaka ekli, ilçe küçük harf (izmir 35 / bornova)", { ...base, cityCode: "35", cityName: "izmir 35", districtName: "bornova", address1: "Kazımdirik Mah. 100. Sok. No: 5" }],
    ["18 sabit hat telefonlu alıcı", { ...base, phone: "0462 692 30 61" }],
  ]
  for (const [name, recipient] of addresses) {
    const ref = `ESC-T${stamp}${name.slice(0, 2)}`
    await step(name, async () => {
      const r = await adapter.createShipment(input(ref, recipient))
      const d = { carrier: "dhl", order_reference: ref, ...r.data }
      cleanup.push(d)
      const p = d.dhl_party as { cityCode?: number; districtCode?: number; mobilePhoneNumber?: string; homePhoneNumber?: string }
      return `gönderi=${String(d.tracking_number ?? "-")} bekliyor=${String(Boolean(d.dhl_barcode_pending))} il/ilçe kodu=${p?.cityCode}/${p?.districtCode} cep=${p?.mobilePhoneNumber || "-"} ev=${p?.homePhoneNumber || "-"} bölge=${String(d.dhl_service_area)} uyarı=${JSON.stringify(d.dhl_warnings ?? [])}`
    })
  }

  // Servis dışı mahalle: CBS'ten gerçek bir örnek bul.
  await step("19 servis dışı mahalle → şubeden teslim", async () => {
    const probes: [number, number, string, string][] = [
      [61, 56, "Trabzon", "Hayrat"],
      [30, 0, "Hakkari", "Merkez"],
      [8, 0, "Artvin", "Merkez"],
    ]
    for (const [city, , cityName] of probes) {
      const districts = (await rawCall(`districts_${city}`, () => client.getDistricts(city))) as { code?: string; name?: string }[]
      if (!Array.isArray(districts)) continue
      for (const dist of districts.slice(0, 6)) {
        const list = await rawCall(`outofservice_${city}_${dist.code}`, () => client.getOutOfServiceAreas(city, Number(dist.code)))
        const first = Array.isArray(list) ? (list[0] as Record<string, unknown> | undefined) : undefined
        if (!first) continue
        raw.out_of_service_sample = first
        const neighbourhood = String(first.neighborhoodName ?? first.neighbourhoodName ?? first.name ?? first.neighborhood ?? "")
        if (!neighbourhood) throw new Error(`servis dışı satırında mahalle adı alanı bulunamadı: ${JSON.stringify(first)}`)
        const ref = `ESC-T${stamp}S`
        const r = await adapter.createShipment(
          input(ref, { ...base, cityCode: String(city), cityName, districtName: String(dist.name), neighbourhood, address1: `${neighbourhood} Mah. Test Sok. No: 1` })
        )
        const d = { carrier: "dhl", order_reference: ref, ...r.data }
        cleanup.push(d)
        if (d.dhl_service_area !== "out_of_service") throw new Error(`bölge=${String(d.dhl_service_area)} (out_of_service bekleniyordu) mahalle=${neighbourhood}`)
        return `${cityName}/${String(dist.name)}/${neighbourhood}: teslimat tipi=${String(d.dhl_delivery_type)} gönderi=${String(d.tracking_number ?? "-")} bekliyor=${String(Boolean(d.dhl_barcode_pending))}`
      }
    }
    throw new Error("denenen ilçelerde servis dışı mahalle listesi boş")
  })

  await step("20 DHL'de olmayan ilçe adı (varış şubesi bulunamaz mı?)", async () => {
    const ref = `ESC-T${stamp}X`
    const r = await adapter.createShipment(input(ref, { ...base, districtName: "Olmayanilçe", address1: "Bilinmeyen Mah. No: 1" }))
    const d = { carrier: "dhl", order_reference: ref, ...r.data }
    cleanup.push(d)
    return `gönderi=${String(d.tracking_number ?? "-")} bekliyor=${String(Boolean(d.dhl_barcode_pending))} son_hata=${String(d.dhl_barcode_last_error ?? "-")} uyarı=${JSON.stringify(d.dhl_warnings ?? [])}`
  })

  // ── 8. DHL'e gitmeden reddedilenler ──
  await step("21 telefonsuz alıcı (DHL'e gitmeden hata)", () => expectError(() => adapter.createShipment(input(`ESC-T${stamp}P`, { ...base, phone: "" })), "DHL_INVALID_RECIPIENT"))
  await step("22 adressiz alıcı (DHL'e gitmeden hata)", () => expectError(() => adapter.createShipment(input(`ESC-T${stamp}Q`, { ...base, address1: "" })), "DHL_INVALID_RECIPIENT"))

  // ── 9. Hata biçimleri (ham) ──
  await step("23 olmayan gönderiyi iptal (ham yanıt)", async () => {
    const r = await rawCall("cancelshipment_missing", () => client.cancelShipment("ESCYOK0000", "000000000000"))
    return JSON.stringify(r).slice(0, 240)
  })
  await step("24 yanlış şifre (ham yanıt)", async () => {
    const bad = new DhlClient({ ...o, password: "yanlis-sifre" })
    return expectError(() => bad.getToken(true))
  })

  // ── Temizlik ──
  for (const d of cleanup) {
    const r = await adapter.cancelShipment(d)
    if (r.dhl_canceled === false) logger.warn(`[suite] temizlik: ${String(d.shipment_ref)} iptal edilemedi — ${String(r.dhl_cancel_error)}`)
  }

  const failed = rows.filter((r) => !r.ok)
  logger.info(`[suite] SONUÇ ${rows.length - failed.length}/${rows.length} geçti${failed.length ? ` — başarısız: ${failed.map((f) => f.name).join("; ")}` : ""}`)
  const out = process.env.DHL_SUITE_OUT
  if (out) {
    // Etiket ZPL'i alıcı bilgisi taşır ve uzundur; rapora yazılmaz.
    writeFileSync(out, JSON.stringify({ env: o.env, at: new Date().toISOString(), rows, raw }, null, 1))
    logger.info(`[suite] rapor → ${out}`)
  }
}
