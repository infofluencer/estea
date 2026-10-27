/**
 * BÖLÜM 6 — Mail şablonları + refund-fail mail gitmeme garantisi
 * SMTP yok — builder + event emit sözleşmesi.
 *
 *   npx tsx test/returns/notifications.ts
 */
import {
  assert,
  assertEqual,
  section,
  summarize,
} from "./_helpers/assert"
import { COMPANY } from "../../src/emails/company"
import {
  buildReturnRefundedCustomerEmail,
  buildReturnCodeCustomerEmail,
  buildReturnRequestedCustomerEmail,
  buildReturnRequestedSellerEmail,
} from "../../src/emails/return-notifications"
import { buildPaytrCriticalAlertEmail } from "../../src/emails/paytr-alerts"
import { readFileSync } from "fs"
import { join } from "path"

async function main() {
  console.log("\n=== notifications ===")

  const items = [
    {
      title: "Rize Siyah Çay 500 g",
      quantity: 1,
      reasonLabel: "Ayıplı / hasarlı ürün",
      variantLabel: "500 g",
    },
  ]

  // ── 1. Return created → customer + seller templates ────────────
  section("1. Talep alındı (müşteri) + yeni talep (satıcı)")
  const customer = buildReturnRequestedCustomerEmail({
    returnId: "return_test_001",
    orderDisplayId: "1042",
    email: "musteri@example.com",
    items,
    customerNote: "Takip: 123456",
  })
  assert(
    "müşteri subject iade",
    customer.subject.includes("İade") ||
      customer.subject.toLocaleLowerCase("tr-TR").includes("iade")
  )
  // İç iade kimliği (return_…) müşteriye gösterilmez — sipariş no yeter
  assert(
    "müşteri html iç iade no YOK",
    !customer.html.includes("return_test_001") && customer.html.includes("1042")
  )
  assert(
    "müşteri html adımlar/kargo",
    customer.html.toLowerCase().includes("kargo")
  )
  // Etiketsiz (kodlu iade) → kod e-postayla gelecek; adrese kargolama talimatı YOK
  assert(
    "müşteri html kod bekleniyor (etiketsiz)",
    customer.html.includes("İade kodunuz") && customer.html.includes("şubesine götürün")
  )
  assert(
    "müşteri html adrese kargolama talimatı yok",
    !customer.html.includes("Kargolama adresi") && !customer.html.includes(COMPANY.address.split(",")[0])
  )

  // İade kodu maili — firma no + kod
  const codeMail = buildReturnCodeCustomerEmail({ orderDisplayId: "1042", code: "IA123456", items })
  assert("kod maili subject", codeMail.subject.includes("İade Kodunuz") && codeMail.subject.includes("1042"))
  assert(
    "kod maili firma no + kod",
    codeMail.html.includes(COMPANY.legalName) && codeMail.html.includes("IA123456") &&
      codeMail.text.includes(COMPANY.legalName) && codeMail.text.includes("IA123456")
  )

  // Elle kargo (mode: address) → adres + adımlar, kod bekleme YOK
  const manual = buildReturnRequestedCustomerEmail({
    returnId: "return_test_003",
    orderDisplayId: "1042",
    email: "musteri@example.com",
    items,
    mode: "address",
  })
  assert(
    "elle kargo: adres var, kod yok",
    manual.html.includes("Kargolama adresi") &&
      manual.html.includes(COMPANY.address.split(",")[0]) &&
      !manual.html.includes("İade kodunuz") &&
      manual.text.includes(COMPANY.address)
  )
  assert("elle kargo: ambalaj adımı", manual.html.includes("açılmamış orijinal ambalajında"))

  // Etiketli şablon — takip no + etiket linki
  const labeled = buildReturnRequestedCustomerEmail({
    returnId: "return_test_002",
    orderDisplayId: "1042",
    email: "musteri@example.com",
    items,
    trackingNumber: "RETTRACK001",
    trackingUrl: "https://track.example/RETTRACK001",
    labelUrl: "https://cdn.example/label.pdf",
    carrierCode: "MNG",
  })
  assert(
    "etiketli subject",
    labeled.subject.includes("Etiket") || labeled.subject.includes("etiket")
  )
  assert("etiketli takip no", labeled.html.includes("RETTRACK001"))
  assert(
    "etiketli şube kodu",
    labeled.html.includes("Şubeye vereceğiniz kod") &&
      labeled.text.includes("Şubeye vereceğiniz kod: RETTRACK001")
  )
  assert("etiketli label url", labeled.html.includes("https://cdn.example/label.pdf"))
  assert(
    "etiketli manuel adres YOK",
    !labeled.html.includes(COMPANY.address.split(",")[0])
  )

  const seller = buildReturnRequestedSellerEmail({
    returnId: "return_test_001",
    orderDisplayId: "1042",
    orderId: "order_01TEST",
    customerEmail: "musteri@example.com",
    customerName: "Ayşe Yılmaz",
    items,
    customerNote: "Takip: 123456",
    source: "guest",
  })
  assert(
    "satıcı subject yeni iade",
    seller.subject.toLowerCase().includes("iade")
  )
  assert(
    "satıcı html müşteri email",
    seller.html.includes("musteri@example.com")
  )
  assert(
    "satıcı html sebep",
    seller.html.includes("Ayıplı") || seller.html.includes("hasarlı")
  )
  assert(
    "satıcı html müşteri notu",
    seller.html.includes("Takip: 123456")
  )
  assertEqual("satıcı hedef info@", COMPANY.emailOps, "info@esteacay.com")

  const alert = buildPaytrCriticalAlertEmail({
    kind: "late_success_canceled",
    merchantOid: "STGoid1",
    orderId: "order_x",
    callbackAmountKurus: "100",
  })
  assert(
    "kritik alert subject",
    alert.subject.includes("KRİTİK") && alert.subject.includes("STGoid1")
  )
  assert(
    "kritik alert iptal",
    alert.html.includes("iptal") || alert.text.includes("iptal")
  )

  // ── 2. Refund completed customer mail ──────────────────────────
  section("2. Refund tamamlandı müşteri maili")
  const refunded = buildReturnRefundedCustomerEmail({
    returnId: "return_test_001",
    orderDisplayId: "1042",
    email: "musteri@example.com",
    amount: 1149.99,
    currencyCode: "TRY",
    shippingIncluded: true,
  })
  assert(
    "refund subject onay",
    refunded.subject.toLowerCase().includes("onay") ||
      refunded.subject.toLowerCase().includes("iade")
  )
  assert(
    "refund tutar görünür",
    refunded.html.includes("1.150") ||
      refunded.html.includes("1149") ||
      refunded.text.includes("1.150") ||
      refunded.text.includes("1149")
  )
  assert(
    "ödeme aracına iade / 14 gün ifadesi",
    refunded.html.includes("14 gün") &&
      (refunded.html.toLowerCase().includes("kart") ||
        refunded.html.toLowerCase().includes("ödeme"))
  )
  assert(
    "banka yansıma ifadesi",
    refunded.html.toLowerCase().includes("banka")
  )

  // ── 3. Fail path must NOT emit refunded event ──────────────────
  section("3. Refund FAIL → refunded mail event yok (sözleşme)")
  const refundSrc = readFileSync(
    join(__dirname, "../../src/lib/return-refund.ts"),
    "utf8"
  )
  // Emit yalnızca try başarı dalında; catch (fail) içinde emit yok
  const emitIdx = refundSrc.indexOf('name: "escay.return_refunded"')
  // PayTR refund çağrısının catch'i (dosyadaki başka try/catch'ler sayılmaz)
  const catchIdx = refundSrc.indexOf(
    "} catch (err) {",
    refundSrc.indexOf("refundPaymentWorkflow(scope).run")
  )
  const catchFailIdx = refundSrc.indexOf('status: "failed"', catchIdx)
  assert("escay.return_refunded emit var", emitIdx > 0)
  assert(
    "emit catch'ten önce (success-only)",
    catchIdx > emitIdx,
    `emit@${emitIdx} catch@${catchIdx}`
  )
  assert(
    "catch fail bloğunda emit yok",
    catchFailIdx > catchIdx &&
      !refundSrc.slice(catchIdx).includes('name: "escay.return_refunded"'),
    `catchFail@${catchFailIdx}`
  )

  // Subscriber wires to escay.return_refunded only
  const subSrc = readFileSync(
    join(__dirname, "../../src/subscribers/return-refunded-email.ts"),
    "utf8"
  )
  assert(
    "refunded-email yalnızca escay.return_refunded",
    subSrc.includes('event: "escay.return_refunded"')
  )
  assert(
    "fail event'ine bağlı değil",
    !subSrc.includes("return_received") ||
      subSrc.includes("escay.return_refunded")
  )

  // ── 4. Recipient correctness in subscriber ─────────────────────
  section("4. Alıcı doğruluğu (subscriber)")
  const reqSrc = readFileSync(
    join(__dirname, "../../src/subscribers/return-requested-email.ts"),
    "utf8"
  )
  assert(
    "müşteri maili order email'ine (ctx.email)",
    reqSrc.includes("to: ctx.email")
  )
  assert(
    "satıcı COMPANY.emailOps / RETURNS_INBOX",
    reqSrc.includes("COMPANY.emailOps") || reqSrc.includes("RETURNS_INBOX")
  )
  assert(
    "refunded müşteri ctx.email",
    subSrc.includes("to: ctx.email")
  )

  // ── 5. Rejection mail + refund guard ───────────────────────────
  section("5. İade reddi mail + refund guard")
  const {
    buildReturnRejectedCustomerEmail,
  } = await import("../../src/emails/return-notifications.js")
  const rejected = buildReturnRejectedCustomerEmail({
    returnId: "return_rej_001",
    orderDisplayId: "1099",
    email: "musteri@example.com",
    reason: "Ürün eksik / hasarlı",
    items,
  })
  assert(
    "red subject değerlendirildi",
    rejected.subject.includes("Değerlendirildi") ||
      rejected.subject.toLocaleLowerCase("tr-TR").includes("iade")
  )
  assert(
    "red html kabul edilememiş",
    rejected.html.includes("kabul edilememiştir") ||
      rejected.html.includes("kabul edilememiş")
  )
  assert(
    "red html sebep",
    rejected.html.includes("hasarlı") || rejected.html.includes("eksik")
  )
  assert(
    "red text para iadesi yok",
    rejected.text.toLocaleLowerCase("tr-TR").includes("iade") &&
      (rejected.text.includes("yapılmayacak") ||
        rejected.html.includes("yapılmayacaktır"))
  )

  const rejSub = readFileSync(
    join(__dirname, "../../src/subscribers/return-rejected-email.ts"),
    "utf8"
  )
  assert(
    "rejected subscriber escay.return_rejected",
    rejSub.includes("escay.return_rejected")
  )

  const refundLibSrc = readFileSync(
    join(__dirname, "../../src/lib/return-refund.ts"),
    "utf8"
  )
  const recvSrc = readFileSync(
    join(__dirname, "../../src/subscribers/return-received-refund.ts"),
    "utf8"
  )
  assert(
    "processReturnRefund isReturnRejected guard",
    refundLibSrc.includes("isReturnRejected")
  )
  assert(
    "return-received-refund isReturnRejected guard",
    recvSrc.includes("isReturnRejected")
  )

  const { isReturnRejected } = await import(
    "../../src/lib/return-rejection.js"
  )
  assert(
    "isReturnRejected true on escay_rejection",
    isReturnRejected({ escay_rejection: { rejected: true } }) === true
  )
  assert(
    "isReturnRejected false on empty",
    isReturnRejected({}) === false
  )

  const code = summarize("notifications")
  process.exit(code > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
