import { createDhlAdapter, labelaryUrlFor, readDhlOptions, type DhlOptions } from "../adapters/dhl"
import { DhlClient, parseDhlDateTime, type DhlTransport } from "../adapters/dhl/client"
import { classifyDhlError, readDhlErrorBody } from "../adapters/dhl/errors"
import {
  buildParty,
  parcelToPiece,
  parseBarcodeResponse,
  parseShipmentStatus,
  toDhlPhone,
  toDhlReference,
  toDhlReturnReference,
} from "../adapters/dhl/shipment"
import { CarrierError, type CreateShipmentInput, type Recipient } from "../types"

// ── Sahte Apizone ────────────────────────────────────────────────────────────

type Call = { method: string; path: string; headers: Record<string, string>; body?: any }
type Reply = { status?: number; json?: unknown; throws?: Error }
type Route = (call: Call, index: number) => Reply

function fakeJwt(expSeconds: number): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `${enc({ alg: "HS256" })}.${enc({ exp: expSeconds })}.sig`
}

function fakeDhl(routes: Record<string, Route>) {
  const calls: Call[] = []
  const counts: Record<string, number> = {}
  const transport: DhlTransport = async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/mngapi\/api\//, "")
    const call: Call = { method: init.method, path, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined }
    calls.push(call)
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => path === k || path.startsWith(`${k}/`))
    const index = key ? (counts[key] = (counts[key] ?? -1) + 1) : 0
    const reply: Reply = key ? routes[key](call, index) : { status: 404, json: { type: "x", title: "Not Found", status: 404, detail: path } }
    if (reply.throws) throw reply.throws
    const status = reply.status ?? 200
    return { ok: status >= 200 && status < 300, status, text: async () => (reply.json === undefined ? "" : JSON.stringify(reply.json)) }
  }
  const paths = () => calls.map((c) => c.path)
  const count = (p: string) => calls.filter((c) => c.path === p || c.path.startsWith(`${p}/`)).length
  return { transport, calls, paths, count }
}

const ok = (json: unknown = [{}]): Reply => ({ json })
const token: Route = () => ok({ jwt: fakeJwt(Math.floor(Date.now() / 1000) + 8 * 3600), jwtExpireDate: "10.03.2099 16:05:00" })
const mngError = (code: string, description: string, status = 500): Reply => ({ status, json: { error: { Code: code, Description: description } } })
const notFound: Route = () => ({ status: 404, json: { type: "about:blank", title: "Not Found", status: 404, detail: "Shipment not found" } })
const subscription401: Reply = {
  status: 401,
  json: { httpCode: "401", httpMessage: "Unauthorized", moreInformation: "Cannot find valid subscription for the incoming API request." },
}

const cbs: Record<string, Route> = {
  "cbsinfoapi/getcities": () => ok([{ code: "61", name: "TRABZON" }, { code: "34", name: "İSTANBUL 34" }]),
  "cbsinfoapi/getdistricts": () => ok([{ cityCode: "61", cityName: "Trabzon", code: "1234", name: "HAYRAT" }]),
  "cbsinfoapi/getoutofserviceareas": notFound,
  "cbsinfoapi/getmobileareas": notFound,
}
const ZPL = "^XA^FDtest^FS^XZ"
const barcodeOk: Route = () => ok([{ referenceId: "ESC65", invoiceId: "564", shipmentId: "271775211111", barcodes: [{ pieceNumber: 1, barcode: "90466653694", value: ZPL }] }])
const happy = (): Record<string, Route> => ({
  token,
  ...cbs,
  "pluscmdapi/createRecipient": () => ok({ shipperBranchCode: "1" }),
  "standardcmdapi/createOrder": () => ok([{ referenceId: "ESC65", orderInvoiceId: "1" }]),
  "barcodecmdapi/createbarcode": barcodeOk,
})

function options(over: Partial<DhlOptions> = {}): DhlOptions {
  return {
    ...readDhlOptions({ DHL_CLIENT_ID: "id", DHL_CLIENT_SECRET: "secret", DHL_CUSTOMER_NUMBER: "123", DHL_PASSWORD: "pw" }),
    barcodeRetryIntervalMs: 10,
    barcodeRetryTimeoutMs: 100,
    ...over,
  }
}

const quiet = { info: () => {}, warn: () => {} }

function adapterWith(routes: Record<string, Route>, over: Partial<DhlOptions> = {}, extra: Record<string, unknown> = {}) {
  const fake = fakeDhl(routes)
  const adapter = createDhlAdapter({ options: () => options(over), transport: fake.transport, logger: quiet, sleep: async () => {}, ...extra })
  return { fake, adapter }
}

const recipient = (over: Partial<Recipient> = {}): Recipient => ({
  name: "Ayşe Yılmaz",
  email: "a@example.com",
  phone: "+905321234567",
  address1: "Uğurlu Cad. No: 9 D:3",
  address2: "Balaban Mah.",
  countryCode: "TR",
  cityCode: "61",
  cityName: "Trabzon",
  districtName: "Hayrat",
  neighbourhood: "Balaban Mahallesi",
  ...over,
})

function input(over: Partial<CreateShipmentInput["order"]> = {}, rec: Partial<Recipient> = {}): CreateShipmentInput {
  return {
    order: { id: "order_1", displayId: 65, reference: "ESC-65", isExchange: false, currencyCode: "TRY", ...over },
    recipient: recipient(rec),
    parcel: { weight: 0.5, length: 30, width: 20, height: 10 },
    items: [{ title: "Siyah çay", quantity: 1 }],
    testMode: true,
  }
}

// ── Saf dönüşümler ───────────────────────────────────────────────────────────

describe("DHL referans / telefon / koli", () => {
  it("referans: tire atılır, büyük harf; iptal edilmiş referans tekrar kullanılmaz", () => {
    expect(toDhlReference("ESC-65")).toBe("ESC65")
    expect(toDhlReference("esc-65-D")).toBe("ESC65D")
    expect(toDhlReference("ESC-65", ["ESC65"])).toBe("ESC65R2")
    expect(toDhlReference("ESC-65", ["ESC65", "ESC65R2"])).toBe("ESC65R3")
    expect(toDhlReference("ESC-123456789012345678").length).toBeLessThanOrEqual(20)
    expect(() => toDhlReference("--")).toThrow(CarrierError)
  })
  it("iade referansı iade başına sabit, ≤20", () => {
    const a = toDhlReturnReference("ESC-65", "return_01HZX9ABCDEF")
    expect(a).toBe(toDhlReturnReference("ESC-65", "return_01HZX9ABCDEF"))
    expect(a).toMatch(/^ESC65I[A-Z0-9]{6}$/)
    expect(toDhlReturnReference("ESC-1234567890123456", "return_x").length).toBeLessThanOrEqual(20)
  })
  it("telefon 10 hane", () => {
    expect(toDhlPhone("+90 532 123 45 67")).toBe("5321234567")
    expect(toDhlPhone("05321234567")).toBe("5321234567")
  })
  it("desi/kg yukarı yuvarlanır, en az 1", () => {
    expect(parcelToPiece({ weight: 0.5, length: 30, width: 20, height: 10 })).toEqual({ desi: 2, kg: 1 })
    expect(parcelToPiece({ weight: 2.1, length: 30, width: 20, height: 15 })).toEqual({ desi: 3, kg: 3 })
    expect(parcelToPiece({ weight: NaN, length: 0, width: 0, height: 0 })).toEqual({ desi: 1, kg: 1 })
  })
})

describe("DHL alıcı doğrulaması", () => {
  const geo = { cityCode: 61, districtCode: 1234 }
  it("geçersiz telefon / boş adres gönderilmeden reddedilir", () => {
    expect(() => buildParty(recipient({ phone: "123" }), geo, "ops@x")).toThrow(/telefon 10 hane/)
    expect(() => buildParty(recipient({ address1: "", address2: "", neighbourhood: "" }), geo, "ops@x")).toThrow(/açık adres/)
  })
  it("sabit hat → homePhoneNumber; e-posta yoksa firma adresi; mahalle adreste yoksa eklenir", () => {
    const p = buildParty(recipient({ phone: "04626923061", email: "", address2: "", neighbourhood: "Balaban" }), geo, "ops@x")
    expect(p).toMatchObject({ mobilePhoneNumber: "", homePhoneNumber: "4626923061", email: "ops@x" })
    expect(p.address).toMatch(/^Balaban Mah\. Uğurlu/)
  })
  it("mahalle zaten adresteyse tekrar eklenmez", () => {
    expect(buildParty(recipient(), geo, "ops@x").address).toBe("Uğurlu Cad. No: 9 D:3 Balaban Mah.")
  })
})

describe("DHL yanıt ayrıştırma", () => {
  it("createbarcode: value ZPL + barcode; value ZPL değilse barkod", () => {
    expect(parseBarcodeResponse([{ shipmentId: "9", barcodes: [{ barcode: "B1", value: ZPL }] }])).toMatchObject({ shipmentId: "9", barcode: "B1", zpl: ZPL })
    expect(parseBarcodeResponse({ shipmentId: "9", barcodes: [{ pieceNumber: 1, value: "Barcode1" }] })).toMatchObject({ barcode: "Barcode1", zpl: "" })
  })
  it("durum kodları 1–8", () => {
    const action = (c: number) => parseShipmentStatus({ shipmentStatusCode: c }).action
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(action)).toEqual(["none", "shipped", "shipped", "shipped", "delivered", "failed", "returned", "failed"])
    expect(parseShipmentStatus({ shipmentStatusCode: 3 }).description).toBe("Teslimat birimine ulaştı")
  })
  it("isDelivered ve retrieveShipmentId kodu ezer; takip linki https olur", () => {
    const s = parseShipmentStatus([{ shipmentStatusCode: 4, isDelivered: 1, shipmentStatus: "Teslim_Edildi", trackingUrl: "www.mngkargo.com.tr/track/1" }])
    expect(s).toMatchObject({ action: "delivered", description: "Teslim Edildi", trackingUrl: "https://www.mngkargo.com.tr/track/1" })
    expect(parseShipmentStatus({ shipmentStatusCode: 6, retrieveShipmentId: "77" }).action).toBe("returned")
    expect(parseShipmentStatus({ shipmentStatus: "Teslim edilemedi" }).action).toBe("failed")
  })
})

describe("DHL hata gövdeleri ve sınıflandırma", () => {
  it("ProblemDetails + ASP.NET doğrulama sözlüğü", () => {
    const r = readDhlErrorBody({ title: "One or more validation errors occurred.", status: 400, errors: { "Order.ReferenceId": ["boş olamaz"] } })
    expect(r.message).toContain("Order.ReferenceId: boş olamaz")
  })
  it("IBM geçidi ve MNG iş hatası", () => {
    expect(readDhlErrorBody(subscription401.json).message).toContain("valid subscription")
    expect(readDhlErrorBody(subscription401.json).code).toBeUndefined()
    expect(readDhlErrorBody([{ error: { Code: "20001", Description: "VARIŞ ŞUBESİ BULUNAMADI" } }])).toMatchObject({ code: "20001" })
    expect(readDhlErrorBody({ code: "26105", description: "'SMS Preference1' 1 ya da 0", errorType: 4 })).toMatchObject({ code: "26105", errorType: 4 })
  })
  it("türler", () => {
    const k = (code: string | null, status: number | null, text = "", path = "standardcmdapi/createOrder") => classifyDhlError({ code, status, path, text }).kind
    expect(k(null, 401, "Cannot find valid subscription")).toBe("subscription")
    expect(classifyDhlError({ code: null, status: 401, path: "barcodecmdapi/createbarcode", text: "valid subscription" }).hint).toContain("Barcode Command")
    expect(k(null, 401, "", "token")).toBe("auth")
    expect(k(null, 403)).toBe("forbidden")
    expect(k("20013", 500)).toBe("env_mismatch")
    expect(k(null, 500, "ESC65 NO'LU SİPARİŞ KAYDI İÇİN VARIŞ ŞUBESİ BULUNAMADI")).toBe("branch_not_ready")
    expect(k("3002", 400)).toBe("order_exists")
    expect(k(null, 400, "Bu referans ile sipariş daha önce oluşturulmuş")).toBe("order_exists")
    expect(k(null, 404, "Sipariş mevcut değil")).toBe("not_found")
    expect(k(null, 400, "Sipariş zaten faturalaşmış")).toBe("already_invoiced")
    expect(k(null, 400, "Sipariş faturalaşmamış")).toBe("validation")
    // Sandbox'tan alınan gerçek metinler (2026-11-11): ikisi de 20001 ile gelir.
    expect(k("20001", 500, "<WERR> ESC65 NO'LU SİPARİŞ KAYDI İÇİN VARIŞ ŞUBESİ BULUNAMADI ! DAHA SONRA TEKRAR DENEYİN ! </WERR>", "barcodecmdapi/createbarcode")).toBe("branch_not_ready")
    expect(k("20001", 500, "<WERR>SİPARİŞ 11.11.26 16:17:14 Tarihinde FM-386849 NO İLE DAHA ÖNCE KESİLMİŞ ! </WERR>", "barcodecmdapi/createbarcode")).toBe("already_invoiced")
    expect(k("3002", 500, "BU SİPARİS NUMARASINA AİT KAYIT ZATEN VAR!")).toBe("order_exists")
    expect(k(null, 429)).toBe("rate_limited")
    expect(k(null, 503)).toBe("transient")
    expect(k("99999", 500)).toBe("unknown")
  })
  it("jwtExpireDate TR saati", () => {
    expect(parseDhlDateTime("10.03.2020 16:05:00")).toBe(Date.parse("2020-03-10T13:05:00Z"))
    expect(parseDhlDateTime("bozuk")).toBeNull()
  })
})

// ── İstemci ──────────────────────────────────────────────────────────────────

describe("DHL istemcisi", () => {
  const client = (routes: Record<string, Route>) => {
    const fake = fakeDhl(routes)
    return { fake, c: new DhlClient({ baseUrl: "https://testapi.mngkargo.com.tr", clientId: "id", clientSecret: "s", customerNumber: "1", password: "p", transport: fake.transport, sleep: async () => {} }) }
  }

  it("IBM başlıkları + Bearer; JWT önbelleklenir", async () => {
    const { fake, c } = client({ token, "standardqueryapi/getshipmentstatus": () => ok([{ shipmentStatusCode: 1 }]) })
    await c.getShipmentStatus("A")
    await c.getShipmentStatus("B")
    expect(fake.count("token")).toBe(1)
    expect(fake.calls[1].headers).toMatchObject({ "X-IBM-Client-Id": "id", "X-IBM-Client-Secret": "s", Authorization: expect.stringMatching(/^Bearer /) })
  })

  it("401 (JWT) → bir kez yenilenir; 401 (abonelik) → yenilenmez", async () => {
    const a = client({ token, "standardqueryapi/getshipmentstatus": (_c, i) => (i === 0 ? { status: 401, json: {} } : ok([{}])) })
    await a.c.getShipmentStatus("A")
    expect(a.fake.count("token")).toBe(2)

    const b = client({ token, "barcodecmdapi/createbarcode": () => subscription401 })
    const err = await b.c.createBarcode({}).catch((e) => e)
    expect(err.context.kind).toBe("subscription")
    expect(err.message).toContain("Barcode Command")
    expect(b.fake.count("token")).toBe(1)
  })

  it("okuma 5xx/429'da bir kez tekrar; yazma tekrarlanmaz", async () => {
    const r = client({ token, "standardqueryapi/getshipmentstatus": (_c, i) => (i === 0 ? { status: 503, json: {} } : ok([{}])) })
    await r.c.getShipmentStatus("A")
    expect(r.fake.count("standardqueryapi/getshipmentstatus")).toBe(2)

    const w = client({ token, "standardcmdapi/createOrder": () => ({ status: 503, json: {} }) })
    await expect(w.c.createOrder({})).rejects.toBeInstanceOf(CarrierError)
    expect(w.fake.count("standardcmdapi/createOrder")).toBe(1)
  })

  it("ağ hatası / zaman aşımı kodlu CarrierError", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" })
    const { c } = client({ token, "standardcmdapi/createOrder": () => ({ throws: abort }) })
    await expect(c.createOrder({})).rejects.toMatchObject({ code: "DHL_TIMEOUT" })
  })

  it("token hataları anlaşılır: yanlış şifre, sandbox↔prod", async () => {
    const bad = client({ token: () => ({ status: 401, json: { type: "x", title: "Unauthorized", status: 401 } }) })
    expect((await bad.c.getToken().catch((e) => e)).message).toContain("Online Şube")
    const env = client({ token: () => mngError("20013", "Kimlik doğrulanamadı") })
    expect((await env.c.getToken().catch((e) => e)).context.kind).toBe("env_mismatch")
  })
})

// ── Adaptör: gönderi ─────────────────────────────────────────────────────────

describe("DHL gönderi açma", () => {
  it("mutlu yol: alıcı ön kaydı → sipariş → barkod; kodlar CBS'ten", async () => {
    const { fake, adapter } = adapterWith(happy())
    const res = await adapter.createShipment(input())

    expect(fake.paths()).toEqual([
      "token",
      "cbsinfoapi/getcities",
      "cbsinfoapi/getdistricts/61",
      "cbsinfoapi/getoutofserviceareas/61/1234",
      "cbsinfoapi/getmobileareas/61/1234",
      "pluscmdapi/createRecipient",
      "standardcmdapi/createOrder",
      "barcodecmdapi/createbarcode",
    ])
    const order = fake.calls.find((c) => c.path === "standardcmdapi/createOrder")!.body
    expect(order.order).toMatchObject({ referenceId: "ESC65", barcode: "ESC65", deliveryType: 1, paymentType: 1, packagingType: 3, smsPreference1: 1 })
    expect(order.recipient).toMatchObject({ cityCode: 61, districtCode: 1234, mobilePhoneNumber: "5321234567", fullName: "Ayşe Yılmaz" })
    expect(order.recipient).not.toHaveProperty("customerId")
    expect(order.orderPieceList[0]).toEqual({ barcode: "ESC65_PARCA1", desi: 2, kg: 1, content: "Es Cay siparis ESC-65" })
    expect(fake.calls.find((c) => c.path === "barcodecmdapi/createbarcode")!.body.printReferenceBarcodeOnError).toBe(0)

    expect(res.data).toMatchObject({
      shipment_ref: "ESC65",
      dhl_reference_id: "ESC65",
      tracking_number: "271775211111",
      barcode: "90466653694",
      label_zpl: ZPL,
      dhl_barcode_pending: false,
      dhl_service_area: "normal",
      dhl_party: expect.objectContaining({ cityCode: 61, districtCode: 1234 }),
    })
    expect(res.labels[0]).toMatchObject({ tracking_number: "271775211111", tracking_url: expect.stringContaining("271775211111") })
  })

  it("createRecipient aboneliği yoksa gönderi yine açılır", async () => {
    const { fake, adapter } = adapterWith({ ...happy(), "pluscmdapi/createRecipient": () => subscription401 })
    const res = await adapter.createShipment(input())
    expect(res.data.dhl_recipient_pre_registered).toBe(false)
    expect(fake.count("standardcmdapi/createOrder")).toBe(1)
  })

  it("20001: AYNI sipariş için barkod tekrar, createOrder bir kez", async () => {
    const { fake, adapter } = adapterWith({
      ...happy(),
      "barcodecmdapi/createbarcode": (c, i) => (i < 2 ? mngError("20001", "VARIŞ ŞUBESİ BULUNAMADI") : barcodeOk(c, i)),
    })
    const res = await adapter.createShipment(input())
    expect(fake.count("standardcmdapi/createOrder")).toBe(1)
    expect(fake.count("barcodecmdapi/createbarcode")).toBe(3)
    expect(res.data.dhl_barcode_attempts).toBe(3)
  })

  it("20001 süre dolarsa hata DEĞİL: etiket bekliyor, iptal yok", async () => {
    let t = 0
    const { fake, adapter } = adapterWith(
      { ...happy(), "barcodecmdapi/createbarcode": () => mngError("20001", "VARIŞ ŞUBESİ BULUNAMADI") },
      {},
      { now: () => (t += 40) }
    )
    const res = await adapter.createShipment(input())
    expect(res.labels).toEqual([])
    expect(res.data).toMatchObject({ shipment_ref: "ESC65", dhl_barcode_pending: true })
    expect(res.data.tracking_number).toBeUndefined()
    expect(fake.calls.some((c) => c.path.startsWith("standardcmdapi/cancelorder"))).toBe(false)
  })

  it("aynı sipariş ikinci kez (3002 + barkod 'daha önce kesilmiş') → mevcut gönderi no, ikinci kayıt yok", async () => {
    const { adapter, fake } = adapterWith({
      ...happy(),
      "standardcmdapi/createOrder": () => mngError("3002", "BU SİPARİS NUMARASINA AİT KAYIT ZATEN VAR!"),
      "barcodecmdapi/createbarcode": () => mngError("20001", "<WERR>SİPARİŞ 11.11.26 16:17:14 Tarihinde FM-386849 NO İLE DAHA ÖNCE KESİLMİŞ ! </WERR>"),
      "standardqueryapi/getshipment": () => ok([{ shipment: { referenceId: "ESC65", shipmentId: "590412995459", shipmentStatusCode: 1 } }]),
    })
    const r = await adapter.createShipment(input())
    expect(r.data).toMatchObject({ tracking_number: "590412995459", dhl_shipment_id: "590412995459", dhl_barcode_pending: false, dhl_label_missing: true })
    expect(fake.calls.filter((c) => c.path === "barcodecmdapi/createbarcode")).toHaveLength(1)
  })

  it("3002 sipariş zaten var → barkoda geçer", async () => {
    const { adapter } = adapterWith({ ...happy(), "standardcmdapi/createOrder": () => mngError("3002", "Sipariş zaten var", 400) })
    expect((await adapter.createShipment(input())).data.dhl_order_already_existed).toBe(true)
  })

  it("createOrder belirsiz (503): tekrar YOK; getorder varsa devam, yoksa hata", async () => {
    const a = adapterWith({ ...happy(), "standardcmdapi/createOrder": () => ({ status: 503, json: {} }), "standardqueryapi/getorder": () => ok({ order: { referenceId: "ESC65" } }) })
    const res = await a.adapter.createShipment(input())
    expect(res.data.dhl_order_already_existed).toBe(true)
    expect(a.fake.count("standardcmdapi/createOrder")).toBe(1)

    const b = adapterWith({ ...happy(), "standardcmdapi/createOrder": () => ({ status: 503, json: {} }), "standardqueryapi/getorder": notFound })
    await expect(b.adapter.createShipment(input())).rejects.toBeInstanceOf(CarrierError)
    expect(b.fake.count("standardcmdapi/createOrder")).toBe(1)
    expect(b.fake.count("barcodecmdapi/createbarcode")).toBe(0)
  })

  it("createbarcode yanıtı kaybolursa getshipment ile gönderi no; etiket Online Şube'den", async () => {
    const { adapter } = adapterWith({
      ...happy(),
      "barcodecmdapi/createbarcode": () => ({ status: 504, json: {} }),
      "standardqueryapi/getshipment": () => ok({ shipment: { shipmentId: "555", shipmentStatusCode: 1 } }),
    })
    const res = await adapter.createShipment(input())
    expect(res.data).toMatchObject({ tracking_number: "555", dhl_label_missing: true, label_zpl: "" })
    await expect(adapter.getLabel!(res.data, "zpl")).rejects.toThrow(/Online Şube/)
  })

  it("DHL doğrulama hatası (400) alan mesajıyla döner", async () => {
    const { adapter } = adapterWith({
      ...happy(),
      "standardcmdapi/createOrder": () => ({ status: 400, json: { title: "One or more validation errors occurred.", status: 400, errors: { "Recipient.Address": ["zorunlu"] } } }),
    })
    await expect(adapter.createShipment(input())).rejects.toThrow(/Recipient\.Address: zorunlu/)
  })

  it("alıcı bilgisi eksikse DHL'e hiç gidilmez", async () => {
    const { fake, adapter } = adapterWith(happy())
    await expect(adapter.createShipment(input({}, { phone: "12" }))).rejects.toMatchObject({ code: "DHL_INVALID_RECIPIENT" })
    expect(fake.count("standardcmdapi/createOrder")).toBe(0)
  })

  it("CBS çökerse il = plaka kodu, ilçe adla", async () => {
    const { fake, adapter } = adapterWith({ ...happy(), "cbsinfoapi/getcities": () => ({ status: 500, json: {} }) })
    await adapter.createShipment(input())
    expect(fake.calls.find((c) => c.path === "standardcmdapi/createOrder")!.body.recipient).toMatchObject({
      cityCode: 61,
      districtCode: 0,
      districtName: "Hayrat",
    })
  })

  it("il adı plaka ekiyle gelse de eşleşir (İSTANBUL 34)", async () => {
    const { fake, adapter } = adapterWith({
      ...happy(),
      "cbsinfoapi/getdistricts": () => ok([{ code: "56", name: "KADIKÖY" }]),
    })
    await adapter.createShipment(input({}, { cityCode: "34", cityName: "İstanbul", districtName: "Kadıköy", neighbourhood: "" }))
    expect(fake.calls.find((c) => c.path === "standardcmdapi/createOrder")!.body.recipient).toMatchObject({ cityCode: 34, districtCode: 56 })
  })

  it("servis dışı mahalle: şubeden teslim (deliveryType 2) ya da engel", async () => {
    const out: Route = () => ok([{ cityId: "61", disctrictId: "1234", neighborhood: "Balaban Mahallesi" }])
    const a = adapterWith({ ...happy(), "cbsinfoapi/getoutofserviceareas": out })
    const res = await a.adapter.createShipment(input())
    expect(a.fake.calls.find((c) => c.path === "standardcmdapi/createOrder")!.body.order.deliveryType).toBe(2)
    expect(res.data.dhl_service_area).toBe("out_of_service")

    const b = adapterWith({ ...happy(), "cbsinfoapi/getoutofserviceareas": out }, { outOfServiceMode: "block" })
    await expect(b.adapter.createShipment(input())).rejects.toMatchObject({ code: "DHL_OUT_OF_SERVICE" })
    expect(b.fake.count("standardcmdapi/createOrder")).toBe(0)
  })

  it("mobil bölge yalnız işaretlenir", async () => {
    const { adapter } = adapterWith({ ...happy(), "cbsinfoapi/getmobileareas": () => ok([{ neighborhood: "Balaban" }]) })
    expect((await adapter.createShipment(input())).data).toMatchObject({ dhl_service_area: "mobile", dhl_delivery_type: 1 })
  })

  it("reship: iptal edilmiş referans yerine ESC65R2", async () => {
    const { fake, adapter } = adapterWith(happy())
    const res = await adapter.createShipment(input({ canceledShipmentRefs: ["ESC65"] }))
    expect(res.data.dhl_reference_id).toBe("ESC65R2")
    expect(fake.calls.find((c) => c.path === "standardcmdapi/createOrder")!.body.order.referenceId).toBe("ESC65R2")
  })

  it("prod + test modu → gönderi açılmaz; kimlik eksikse anlaşılır hata", async () => {
    const a = adapterWith({ token }, { env: "prod" })
    await expect(a.adapter.createShipment(input())).rejects.toMatchObject({ code: "DHL_TEST_MODE_PROD" })
    expect(a.fake.calls).toHaveLength(0)
    const b = createDhlAdapter({ options: () => readDhlOptions({}), logger: quiet })
    await expect(b.createShipment(input())).rejects.toMatchObject({ code: "DHL_CONFIG" })
  })

  it("prod host yalnız DHL_ENV=prod ile; DHL_BASE_URL prod'u ezemez", () => {
    expect(readDhlOptions({}).env).toBe("sandbox")
    // Sandbox kimlikleri ayrı adla durur; canlıda asla okunmaz, sandbox'ta canlınınkinin önüne geçer.
    const both = { DHL_CLIENT_ID: "live", DHL_PASSWORD: "livepw", DHL_SANDBOX_CLIENT_ID: "test", DHL_SANDBOX_PASSWORD: "testpw" }
    expect(readDhlOptions(both)).toMatchObject({ clientId: "test", password: "testpw" })
    expect(readDhlOptions({ ...both, DHL_ENV: "prod" })).toMatchObject({ clientId: "live", password: "livepw" })
    expect(readDhlOptions({ DHL_CLIENT_ID: "only" }).clientId).toBe("only")
    expect(readDhlOptions({ DHL_ENV: "production" }).env).toBe("sandbox")
    expect(readDhlOptions({ DHL_ENV: "prod", DHL_BASE_URL: "https://evil" }).baseUrl).toBe("https://api.mngkargo.com.tr")
  })
})

// ── Adaptör: yoklama ─────────────────────────────────────────────────────────

describe("DHL durum yoklaması", () => {
  const pending = {
    carrier: "dhl",
    shipment_ref: "ESC65",
    dhl_reference_id: "ESC65",
    order_reference: "ESC-65",
    dhl_barcode_pending: true,
    dhl_created_at: new Date(0).toISOString(),
    dhl_parcel: { weight: 0.5, length: 30, width: 20, height: 10 },
  }

  it("etiket bekleyen gönderide barkodu alır → patch + etiket satırı", async () => {
    const { adapter } = adapterWith(happy())
    const s = await adapter.getStatus!(pending)
    expect(s.action).toBe("none")
    expect(s.patch).toMatchObject({ tracking_number: "271775211111", label_zpl: ZPL, dhl_barcode_pending: false })
    expect(s.labels?.[0].tracking_number).toBe("271775211111")
  })

  it("hâlâ 20001 ve süre aşıldıysa admin uyarısı", async () => {
    const { adapter } = adapterWith(
      { ...happy(), "barcodecmdapi/createbarcode": () => mngError("20001", "VARIŞ ŞUBESİ BULUNAMADI") },
      {},
      { now: () => 10 * 60 * 60 * 1000 }
    )
    const s = await adapter.getStatus!(pending)
    expect(s).toMatchObject({ code: "BARCODE_PENDING", action: "none", alert: { level: "error" } })
  })

  it("teslim + DHL takip linki kayda yazılır", async () => {
    const { adapter } = adapterWith({
      token,
      "standardqueryapi/getshipmentstatus": () => ok([{ shipmentStatusCode: 5, isDelivered: 1, trackingUrl: "www.mngkargo.com.tr/track/1", deliveryTo: "Ayşe" }]),
    })
    const s = await adapter.getStatus!({ carrier: "dhl", dhl_reference_id: "ESC65", dhl_shipment_id: "1" })
    expect(s.action).toBe("delivered")
    expect(s.patch).toMatchObject({ tracking_url: "https://www.mngkargo.com.tr/track/1", dhl_delivered_to: "Ayşe" })
  })

  it("404 → hata değil, uyarı", async () => {
    const { adapter } = adapterWith({ token, "standardqueryapi/getshipmentstatus": notFound })
    expect(await adapter.getStatus!({ carrier: "dhl", dhl_reference_id: "ESC65" })).toMatchObject({ code: "NOT_FOUND", action: "none", alert: { level: "warning" } })
  })

  it("destek gerekiyor (8) → failed + uyarı", async () => {
    const { adapter } = adapterWith({ token, "standardqueryapi/getshipmentstatus": () => ok([{ shipmentStatusCode: 8 }]) })
    expect(await adapter.getStatus!({ carrier: "dhl", dhl_reference_id: "ESC65" })).toMatchObject({ action: "failed", alert: { level: "error" } })
  })

  it("Labelary boyutu etiketin kendi ölçüsünden (DHL 831×959 nokta → 4.09×4.72 inç)", () => {
    expect(labelaryUrlFor("^XA^PW831^LL0959^FDx^FS^XZ")).toBe("https://api.labelary.com/v1/printers/8dpmm/labels/4.09x4.72/")
    expect(labelaryUrlFor("^XA^FDx^FS^XZ")).toBe("https://api.labelary.com/v1/printers/8dpmm/labels/4x6/")
  })

  it("sandbox simülasyonu: dhl_sim varsa DHL sorulmaz; canlıda alan yok sayılır", async () => {
    const live = () => ok({ shipmentStatusCode: 1, shipmentStatus: "Gönderi Hazırlandı" })
    const data = (code: string) => ({ carrier: "dhl", dhl_reference_id: "ESC65", dhl_shipment_id: "1", dhl_sim: { code } })
    const sandbox = adapterWith({ token, "standardqueryapi/getshipmentstatus": live })
    expect(await sandbox.adapter.getStatus!(data("4"))).toMatchObject({ code: "4", action: "shipped" })
    expect(await sandbox.adapter.getStatus!(data("5"))).toMatchObject({ code: "5", action: "delivered", patch: { dhl_delivered_to: "ALICI KENDİSİ" } })
    expect(await sandbox.adapter.getStatus!(data("7"))).toMatchObject({ code: "7", action: "returned" })
    expect(await sandbox.adapter.getStatus!(data("99"))).toMatchObject({ code: "1" }) // geçersiz kod → gerçek sorgu
    const prod = adapterWith({ token, "standardqueryapi/getshipmentstatus": live }, { env: "prod" })
    expect(await prod.adapter.getStatus!(data("5"))).toMatchObject({ code: "1", action: "none" })
  })

  it("dışarıdan bağlanan gönderi: gönderi no ile sorgu", async () => {
    const { fake, adapter } = adapterWith({ token, "standardqueryapi/getshipmentstatusByShipmentId": () => ok([{ shipmentStatusCode: 2 }]) })
    expect((await adapter.getStatus!({ carrier: "dhl", shipment_ref: "271775211111", attached_externally: true })).action).toBe("shipped")
    expect(fake.calls.at(-1)!.path).toBe("standardqueryapi/getshipmentstatusByShipmentId/271775211111")
  })
})

// ── Adaptör: iptal, etiket, iade, sağlık ─────────────────────────────────────

describe("DHL iptal", () => {
  it("barkodlu: cancelshipment(ref, gönderi no) → cancelorder", async () => {
    const { fake, adapter } = adapterWith({ token, "barcodecmdapi/cancelshipment": () => ok("OK"), "standardcmdapi/cancelorder": () => ok("OK") })
    await adapter.cancelShipmentStrict!({ carrier: "dhl", dhl_reference_id: "ESC65", dhl_shipment_id: "271775211111" })
    expect(fake.calls.slice(1).map((c) => [c.method, c.path, c.body])).toEqual([
      ["PUT", "barcodecmdapi/cancelshipment", { referenceId: "ESC65", shipmentId: "271775211111" }],
      ["PUT", "standardcmdapi/cancelorder/ESC65", undefined],
    ])
  })

  it("şube kabul ettiyse: Strict fırlatır, normal iptal yutar", async () => {
    const { adapter } = adapterWith({ token, "barcodecmdapi/cancelshipment": () => mngError("30010", "Gönderi şubede işlem görmüş", 400) })
    const data = { carrier: "dhl", dhl_reference_id: "ESC65", dhl_shipment_id: "1" }
    await expect(adapter.cancelShipmentStrict!(data)).rejects.toThrow(/DHL'den istenmeli/)
    expect(await adapter.cancelShipment(data)).toMatchObject({ dhl_canceled: false })
  })

  it("barkodsuz: yalnız cancelorder; DHL'de yoksa iptal sayılır", async () => {
    const { fake, adapter } = adapterWith({ token, "standardcmdapi/cancelorder": notFound })
    await adapter.cancelShipmentStrict!({ carrier: "dhl", dhl_reference_id: "ESC65", dhl_barcode_pending: true })
    expect(fake.count("barcodecmdapi/cancelshipment")).toBe(0)
  })

  it("dış gönderi API'den iptal edilmez", async () => {
    const { adapter } = adapterWith({ token })
    const data = { carrier: "dhl", shipment_ref: "271775211111", attached_externally: true }
    expect(await adapter.cancelShipment(data)).toEqual({})
    await expect(adapter.cancelShipmentStrict!(data)).rejects.toMatchObject({ code: "DHL_NO_REFERENCE" })
  })
})

describe("DHL etiket", () => {
  it("ZPL döner; PDF yalnız DHL_LABEL_PDF=labelary ile", async () => {
    const data = { label_zpl: "^XA^XZ" }
    const off = createDhlAdapter({ options: () => options(), logger: quiet })
    expect(await off.getLabel!(data, "zpl")).toBe("^XA^XZ")
    await expect(off.getLabel!(data, "pdf")).rejects.toMatchObject({ code: "DHL_LABEL_PDF_DISABLED" })

    const fetchImpl = jest.fn(async () => new Response(Buffer.from("%PDF-1.4"), { status: 200 })) as unknown as typeof fetch
    const on = createDhlAdapter({ options: () => options({ labelPdf: true }), logger: quiet, fetchImpl })
    const pdf = await on.getLabel!(data, "pdf")
    expect(Buffer.isBuffer(pdf) && pdf.subarray(0, 5).toString()).toBe("%PDF-")
  })

  it("etiket bekleyen gönderide anlaşılır mesaj", async () => {
    const off = createDhlAdapter({ options: () => options(), logger: quiet })
    await expect(off.getLabel!({ dhl_barcode_pending: true }, "zpl")).rejects.toThrow(/varış şubesi/)
  })
})

describe("DHL iade", () => {
  const original = {
    carrier: "dhl",
    order_reference: "ESC-65",
    dhl_reference_id: "ESC65",
    test_mode: true,
    dhl_parcel: { weight: 0.5, length: 30, width: 20, height: 10 },
    dhl_party: buildParty(recipient(), { cityCode: 61, districtCode: 1234 }, "ops@x"),
  }

  it("createReturnOrder: gönderici müşteri, ücret alıcıda (2); kod = referans, etiket linki", async () => {
    const { fake, adapter } = adapterWith({
      token,
      "standardcmdapi/createReturnOrder": () => ok({ referenceId: "x", returnOrderLabelURL: "https://mn.tc?rtnid=EPPS" }),
    })
    const res = await adapter.createReturn!(original, "return_01ABCDEF")
    const body = fake.calls.find((c) => c.path === "standardcmdapi/createReturnOrder")!.body
    expect(body.shipper).toMatchObject({ fullName: "Ayşe Yılmaz", cityCode: 61, districtCode: 1234 })
    expect(body).not.toHaveProperty("recipient")
    expect(body.order).toMatchObject({ paymentType: 2, referenceId: res.returnCode })
    expect(res).toMatchObject({ returnCode: expect.stringMatching(/^ESC65I/), labelUrl: "https://mn.tc?rtnid=EPPS" })
  })

  it("aynı iade ikinci kez → 3002, aynı kod", async () => {
    const { adapter } = adapterWith({ token, "standardcmdapi/createReturnOrder": () => mngError("3002", "zaten var", 400) })
    const res = await adapter.createReturn!(original, "return_01ABCDEF")
    expect(res.returnCode).toBe(toDhlReturnReference("ESC-65", "return_01ABCDEF"))
    expect(res.data.dhl_return_existed).toBe(true)
  })

  it("alıcı özeti yoksa (eski/dış gönderi) elle açılsın diye hata", async () => {
    const { adapter } = adapterWith({ token })
    await expect(adapter.createReturn!({ carrier: "dhl", shipment_ref: "1" }, "return_1")).rejects.toMatchObject({ code: "DHL_NO_PARTY" })
  })
})

describe("DHL sağlık kontrolü", () => {
  it("token + okuma uçları (404 beklenen) + API durumları", async () => {
    const { adapter } = adapterWith({
      token,
      "cbsinfoapi/getcities": () => ok([]),
      "standardqueryapi/getshipmentstatus": notFound,
      "utilityapi/getapistatuses": () => ok([{ apiName: "Standard Query API", status: "Degraded Performance" }]),
    })
    const h = await adapter.healthCheck!()
    expect(h.ok).toBe(true)
    expect(h.warnings.join(" ")).toContain("Degraded")
  })

  it("abonelik eksikse ok=false", async () => {
    const { adapter } = adapterWith({ token, "cbsinfoapi/getcities": () => subscription401, "standardqueryapi/getshipmentstatus": notFound })
    const h = await adapter.healthCheck!()
    expect(h.ok).toBe(false)
    expect(h.warnings.join(" ")).toContain("CBS Info")
  })

  it("token alınamazsa ok=false + neden", async () => {
    const { adapter } = adapterWith({ token: () => ({ status: 401, json: {} }) })
    const h = await adapter.healthCheck!()
    expect(h).toMatchObject({ ok: false })
    expect(h.warnings.join(" ")).toContain("Müşteri no ya da şifre")
  })

  it("owns: carrier=dhl veya DHL referansı", () => {
    const adapter = createDhlAdapter({ options: () => options(), logger: quiet })
    expect(adapter.owns({ carrier: "dhl" })).toBe(true)
    expect(adapter.owns({ dhl_reference_id: "ESC65" })).toBe(true)
    expect(adapter.owns({ carrier: "manual" })).toBe(false)
  })
})
