/**
 * BÖLÜM 3 — PayTR refund MOCK (canlı para YOK)
 *
 * Doğrudan PaytrProviderService.refundPayment + mock-iade katmanı.
 * NOT: PayTR /odeme/iade TL string ister ("1749.00"), kuruş DEĞİL.
 * get-token ×100 (kuruş); iade API noktalı TL — resmi PayTR dokümanı.
 *
 *   PAYTR_MOCK=1 npx tsx test/returns/paytr-refund.mock.ts
 */
import { readFileSync } from "fs"
import { join } from "path"
import {
  assert,
  assertEqual,
  section,
  summarize,
} from "./_helpers/assert"
import {
  buildRefundReferenceNo,
  computeRefundHash,
  formatPaytrReturnAmount,
} from "../../src/modules/paytr/hash"
import {
  getLastPaytrIadeMockRequest,
  getPaytrIadeMockRequests,
  resetPaytrIadeMock,
} from "../../src/modules/paytr/mock-iade"
import PaytrProviderService from "../../src/modules/paytr/service"

process.env.PAYTR_MOCK = "1"

const MERCHANT = {
  merchantId: "TEST_MID",
  merchantKey: "TEST_KEY",
  merchantSalt: "TEST_SALT",
}

function makeProvider() {
  const logger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  }
  return new PaytrProviderService(
    { logger } as never,
    {
      merchantId: MERCHANT.merchantId,
      merchantKey: MERCHANT.merchantKey,
      merchantSalt: MERCHANT.merchantSalt,
      testMode: "1",
    }
  )
}

async function main() {
  console.log("\n=== paytr-refund.mock ===")
  const provider = makeProvider()

  // ── 1. Unit format (TL, not kuruş) ─────────────────────────────
  section("1. Birim dönüşümü (iade API = TL string)")
  const cases: [number, string][] = [
    [1749, "1749.00"],
    [599, "599.00"],
    [1259.3, "1259.30"],
    [2199, "2199.00"],
    [19.9, "19.90"],
  ]
  for (const [tryAmount, expected] of cases) {
    assertEqual(
      `${tryAmount} TRY → "${expected}" (kuruş ${Math.round(tryAmount * 100)} DEĞİL)`,
      formatPaytrReturnAmount(tryAmount),
      expected
    )
  }
  // Explicit anti-kuruş guard
  assert(
    "1749 TRY kuruş olarak 174900 gönderilMEMELİ",
    formatPaytrReturnAmount(1749) !== "174900"
  )

  // ── 2–3. merchant_oid + hash via live refundPayment call ───────
  section("2–3. merchant_oid + hash mock body")
  resetPaytrIadeMock("success")
  const merchantOid = "MpaysesTESTOID001"
  const amount = 1259.3
  const result = await provider.refundPayment({
    amount,
    data: {
      session_id: "payses_test",
      merchant_oid: merchantOid,
      paytr_status: "success",
    },
  })
  const captured = getLastPaytrIadeMockRequest()
  assert("mock isteği yakalandı", Boolean(captured))
  assertEqual("merchant_oid birebir", captured?.merchant_oid, merchantOid)
  assertEqual(
    "return_amount TL string",
    captured?.return_amount,
    "1259.30"
  )

  const expectedHash = computeRefundHash({
    merchantId: MERCHANT.merchantId,
    merchantOid,
    returnAmount: "1259.30",
    merchantSalt: MERCHANT.merchantSalt,
    merchantKey: MERCHANT.merchantKey,
  })
  assertEqual("paytr_token hash eşleşir", captured?.paytr_token, expectedHash)
  assert(
    "refundPayment data.paytr_refunds success",
    Array.isArray((result.data as { paytr_refunds?: unknown[] })?.paytr_refunds) &&
      ((result.data as { paytr_refunds: { status: string }[] }).paytr_refunds[0]
        ?.status === "success")
  )

  // ── 4. Partial amount ──────────────────────────────────────────
  section("4. Kısmi tutar")
  resetPaytrIadeMock("success")
  await provider.refundPayment({
    amount: 599,
    data: {
      session_id: "payses_partial",
      merchant_oid: "MPARTIAL001",
      paytr_status: "success",
    },
  })
  assertEqual(
    "kısmi return_amount 599.00",
    getLastPaytrIadeMockRequest()?.return_amount,
    "599.00"
  )

  // ── 5. Idempotency ─────────────────────────────────────────────
  section("5. Idempotency (aynı reference_no → ikinci HTTP yok)")
  resetPaytrIadeMock("success")
  const oid = "MIDEM001"
  const session = {
    session_id: "payses_idem",
    merchant_oid: oid,
    paytr_status: "success" as const,
  }
  const first = await provider.refundPayment({ amount: 100, data: { ...session } })
  assertEqual("ilk çağrı 1 HTTP", getPaytrIadeMockRequests().length, 1)

  // Provider: reference_no = f(oid, amount, priorRefunds.length).
  // Success kaydı, bir sonraki attempt index'i ile aynı ref'e sahipse no-op.
  const seededRef = buildRefundReferenceNo(oid, "100.00", 1)
  resetPaytrIadeMock("success")
  await provider.refundPayment({
    amount: 100,
    data: {
      ...session,
      paytr_refunds: [
        {
          reference_no: seededRef,
          return_amount: "100.00",
          status: "success" as const,
          at: new Date().toISOString(),
        },
      ],
    },
  })
  assertEqual(
    "seeded same-slot success → HTTP yok",
    getPaytrIadeMockRequests().length,
    0
  )

  // Return-level guard (processReturnRefund metadata.paytr_refund.status)
  // aynı return için çift iadeyi engeller — kaynak sözleşmesi:
  const refundSrc = readFileSync(
    join(__dirname, "../../src/lib/return-refund.ts"),
    "utf8"
  )
  assert(
    "return-level idempotent skip (metadata success)",
    refundSrc.includes('existing?.status === "success"')
  )

  // first.data hâlâ geçerli (kullanıldı)
  assert(
    "ilk refund data.paytr_refunds dolu",
    Array.isArray((first.data as { paytr_refunds?: unknown[] })?.paytr_refunds)
  )

  // ── 6. Fail path ───────────────────────────────────────────────
  section("6. PayTR fail → throw")
  resetPaytrIadeMock("fail")
  let threw = false
  try {
    await provider.refundPayment({
      amount: 50,
      data: {
        session_id: "payses_fail",
        merchant_oid: "MFAIL001",
        paytr_status: "success",
      },
    })
  } catch (err) {
    threw = true
    assert(
      "hata mesajı anlamlı",
      String(err).includes("PayTR iade"),
      String(err)
    )
  }
  assert("fail yanıtı exception fırlatır", threw)

  // ── 7. Network error ───────────────────────────────────────────
  section("7. Network/timeout graceful fail")
  resetPaytrIadeMock("network_error")
  let netThrew = false
  try {
    await provider.refundPayment({
      amount: 50,
      data: {
        session_id: "payses_net",
        merchant_oid: "MNET001",
        paytr_status: "success",
      },
    })
  } catch {
    netThrew = true
  }
  assert("network error throw (yutulmaz)", netThrew)

  const code = summarize("paytr-refund.mock")
  process.exit(code > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
