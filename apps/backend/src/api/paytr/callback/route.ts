import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { recordOpsEvent } from "../../../lib/ops-events"
import { PaymentActions } from "@medusajs/framework/utils"
import { callbackAmountMatchesSession, verifyCallbackHash } from "../../../modules/paytr/hash"
import { isPaytrMockEnabled } from "../../../modules/paytr/mock-iade"
import {
  findOrderIdForPaymentSession,
  findPaymentSessionByMerchantOid,
  markCallbackProcessed,
  markPaytrSessionPaid,
  paytrCallbackLockKey,
  recordFailedAttempt,
  resolveLocking,
  resolvePaymentModule,
  retrieveOrderForCancelGuard,
  type PaymentSessionLike,
} from "../../../modules/paytr/order-guards"
import {
  callbackAutoRefundEnabled,
  manualReviewStatusFor,
  pickCallbackPaymentAmount,
  type PaytrSuccessAnomalyKind,
} from "../../../modules/paytr/callback-state"
import {
  compensatePaytrCharge,
  sendPaytrCriticalAlert,
} from "../../../lib/paytr-compensate"
import {
  ensureCheckoutForSession,
  findPaytrCheckout,
  recordPaytrCheckoutFailure,
  settlePaytrCheckout,
} from "../../../lib/paytr-checkout"

export class PaytrCallbackProcessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PaytrCallbackProcessError"
  }
}

/**
 * PayTR server-to-server bildirim endpoint'i (Adım 2).
 *
 * Route: POST /paytr/callback
 *
 * KRİTİK KURALLAR:
 * 1. AUTH/CORS olmadan erişilebilir (middleware muafiyeti — middlewares.ts'e eklendi).
 * 2. Yalnızca düz metin "OK" döner (bad hash hariç).
 * 3. İdempotency YALNIZCA success için: işlenmiş success tekrar gelirse no-op, OK dön.
 * 4. Hash geçersizse "PAYTR notification failed: bad hash" → PayTR retry yapmaz.
 * 5. FAILED → sipariş İPTAL EDİLMEZ, oturum kilitlenmez; yalnızca sayaç + sebep yazılır.
 *    PayTR 3D Secure başarısız olunca aynı merchant_oid ile tekrar deneme sunar; ikinci
 *    deneme success gelince normal capture olur. Vazgeçen müşterinin siparişini
 *    temizlik işi (jobs/cancel-unpaid-paytr-orders) iptal eder.
 * 6. Tutarsız success (iptal siparişe geç success, tutar farkı, siparişsiz session):
 *    otomatik iade YOK — uyarı maili + elle inceleme. PAYTR_CALLBACK_AUTO_REFUND=1 ile
 *    eski otomatik iade davranışı açılır.
 * 7. Sipariş burada oluşur: paytr_checkout kaydı olan numarada para önce kayda yazılır,
 *    sonra sepet tamamlanır (lib/paytr-checkout.ts). Kayıt yoksa eski yol (stub / mevcut
 *    sipariş).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, string>)
      : {}
  const logger = req.scope.resolve("logger")

  const merchantOid = body.merchant_oid || ""
  const status = body.status || ""
  const totalAmount = body.total_amount || ""
  // total_amount taksit/vade farkı dahil müşterinin ödediği tutardır; sipariş
  // tutarı payment_amount'tur. Tutar kontrolü ve capture payment_amount ile yapılır
  // (imzasız alan: biçimi bozuksa ya da total'ı aşıyorsa imzalı total_amount kullanılır).
  const paymentAmount = pickCallbackPaymentAmount(body.payment_amount, totalAmount)
  const incomingHash = body.hash || ""
  const failedReasonCode = body.failed_reason_code || ""
  const failedReasonMsg = body.failed_reason_msg || ""
  // PayTR para birimini "TL" olarak bildirir; kuruşu denk gelen başka birim sipariş açmasın.
  const currency = body.currency || ""

  const merchantKey = process.env.PAYTR_MERCHANT_KEY || ""
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT || ""

  // Boş anahtarla HMAC'i herkes hesaplayabilir → sahte "success" capture olur.
  // Kimlik yoksa yalnızca PAYTR_MOCK (yerel test) altında devam edilir.
  if ((!merchantKey || !merchantSalt) && !isPaytrMockEnabled()) {
    logger?.error(
      `[paytr/callback] PAYTR_MERCHANT_KEY/SALT tanımlı değil — bildirim reddedildi (merchant_oid=${merchantOid})`
    )
    res.status(200).send("PAYTR notification failed: not configured")
    return
  }

  // ── 1. Hash doğrulama ────────────────────────────────────────────────
  const hashValid = verifyCallbackHash(incomingHash, {
    merchantOid,
    merchantSalt,
    status,
    totalAmount,
    merchantKey,
  })

  if (!hashValid) {
    logger?.warn(
      `[paytr/callback] Bad hash — merchant_oid=${merchantOid}`
    )
    res.status(200).send("PAYTR notification failed: bad hash")
    return
  }

  logger?.info(
    `[paytr/callback] Hash OK — merchant_oid=${merchantOid} status=${status} total=${totalAmount} payment=${paymentAmount}`
  )

  if (!merchantOid) {
    res.status(200).send("OK")
    return
  }

  // ── 2–5. Lock + idempotency + process ────────────────────────────────
  try {
    // Redis kilidi: ttl boyunca tutulur (sipariş + tahsilat + abonelikler 30 sn'yi aşabilir).
    await resolveLocking(req.scope).execute(
      paytrCallbackLockKey(merchantOid),
      async () => {
        await processPaytrCallback(req, {
          merchantOid,
          status,
          paymentAmount,
          currency,
          failedReasonCode,
          failedReasonMsg,
        })
      },
      { timeout: 30, ttl: 180 }
    )
  } catch (err) {
    logger?.error(
      `[paytr/callback] locked process hatası — oid=${merchantOid}: ${formatUnknownError(err)}`
    )
    // İş akışı / telafi fail: OK DEĞİL — PayTR retry eder (cleanup iptal etmesin).
    if (err instanceof PaytrCallbackProcessError) {
      res.status(500).send("PAYTR notification failed: process error")
      return
    }
    res.status(500).send("PAYTR notification failed: process error")
    return
  }

  res.status(200).send("OK")
}

/** Readable error for logs — avoids "[object Object]". */
function formatUnknownError(err: unknown): string {
  if (err instanceof Error) {
    const parts = [
      err.name || "Error",
      err.message || "(no message)",
    ]
    if (err.stack) parts.push(err.stack)
    return parts.join(" | ")
  }
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>
    const name = typeof rec.name === "string" ? rec.name : undefined
    const message = typeof rec.message === "string" ? rec.message : undefined
    const stack = typeof rec.stack === "string" ? rec.stack : undefined
    if (name || message || stack) {
      return [name, message, stack].filter(Boolean).join(" | ")
    }
    try {
      return JSON.stringify(err)
    } catch {
      return Object.prototype.toString.call(err)
    }
  }
  return String(err)
}

async function processPaytrCallback(
  req: MedusaRequest,
  input: {
    merchantOid: string
    status: string
    paymentAmount: string
    currency: string
    failedReasonCode: string
    failedReasonMsg: string
  }
) {
  const logger = req.scope.resolve("logger")
  const { merchantOid, status, paymentAmount, currency, failedReasonCode, failedReasonMsg } =
    input
  const totalAmount = paymentAmount

  const checkout = await findPaytrCheckout(req.scope, merchantOid)
  if (checkout) {
    if (status === "success") {
      const result = await settlePaytrCheckout(req.scope, checkout, {
        paidKurus: Number(paymentAmount),
        paidCurrency: currency,
        source: "callback",
      })
      logger?.info(
        `[paytr/callback] Ödeme kaydı işlendi — merchant_oid=${merchantOid} sonuç=${result.outcome}`
      )
    } else {
      await recordPaytrCheckoutFailure(req.scope, checkout, {
        code: failedReasonCode,
        msg: failedReasonMsg,
      })
    }
    return
  }

  let session = await findPaymentSessionByMerchantOid(req.scope, merchantOid)

  if (!session) {
    logger?.warn(
      `[paytr/callback] Session bulunamadı — merchant_oid=${merchantOid}. OK (idempotency veya geç callback).`
    )
    // Hash doğru ve success: para alınmış ama bağlanacak oturum yok. Sessiz OK yerine
    // kritik uyarı (Mareen'de 30.10'da silinmiş oturumda ödeme böyle fark edilmedi).
    if (status === "success") {
      await sendPaytrCriticalAlert(req.scope, {
        kind: "session_not_found",
        merchantOid,
        callbackAmountKurus: totalAmount,
        detail: "Callback success; bu merchant_oid ile ödeme oturumu yok (oturum silinmiş olabilir).",
      })
    }
    return
  }

  // Fresh retrieve for amount/currency + data
  const payment = resolvePaymentModule(req.scope)
  session = (await payment.retrievePaymentSession(session.id)) as PaymentSessionLike

  const sessionData = (session.data || {}) as Record<string, unknown>
  if (sessionData.callback_processed === true) {
    logger?.info(
      `[paytr/callback] İdempotency: ${merchantOid} zaten işlendi — no-op`
    )
    return
  }

  const amountMajor = Number(totalAmount) / 100
  const orderId = await findOrderIdForPaymentSession(req.scope, session)

  if (status === "success") {
    const order = orderId
      ? await retrieveOrderForCancelGuard(req.scope, orderId)
      : null

    if (!orderId || !order) {
      // Kayıt adımı atlanmış ama sepete bağlı oturum: normal yoldan sipariş açılır.
      const created = orderId ? null : await ensureCheckoutForSession(req.scope, session)
      if (created) {
        await settlePaytrCheckout(req.scope, created, {
          paidKurus: Number(paymentAmount),
          paidCurrency: currency,
          source: "session",
        })
        return
      }
      await compensateOrThrow(req, {
        kind: "success_no_order",
        merchantOid,
        session,
        totalAmount,
        orderId,
        detail: "Session var, sipariş yok — PayTR tahsilatı iade edilecek",
      })
      return
    }

    if (order.status === "canceled" || order.canceled_at) {
      await compensateOrThrow(req, {
        kind: "late_success_canceled",
        merchantOid,
        session,
        totalAmount,
        orderId,
        detail: "Cleanup/fail sonrası geç success — capture yok, iade telafisi",
      })
      return
    }

    if (!callbackAmountMatchesSession(totalAmount, session.amount)) {
      await compensateOrThrow(req, {
        kind: "amount_mismatch",
        merchantOid,
        session,
        totalAmount,
        orderId,
        detail: `callback=${totalAmount} session=${String(session.amount)}`,
      })
      return
    }

    // Signal authorizePayment before Medusa SUCCESSFUL autocapture path runs
    // (callback_processed stays false until after the workflow — idempotency gate).
    session = await markPaytrSessionPaid(req.scope, session.id)

    try {
      await processPaymentWorkflow(req.scope).run({
        input: {
          action: PaymentActions.SUCCESSFUL,
          data: {
            session_id: session.id,
            amount: amountMajor,
          },
        },
      })
    } catch (err) {
      await sendPaytrCriticalAlert(req.scope, {
        kind: "process_failed",
        merchantOid,
        orderId,
        sessionId: session.id,
        callbackAmountKurus: totalAmount,
        sessionAmount: String(session.amount ?? ""),
        detail: formatUnknownError(err),
      })
      throw new PaytrCallbackProcessError(
        `processPaymentWorkflow failed oid=${merchantOid}: ${formatUnknownError(err)}`
      )
    }

    // Re-fetch after workflow may have mutated session
    session = (await payment.retrievePaymentSession(session.id)) as PaymentSessionLike
    await markCallbackProcessed(req.scope, session, {
      paytr_status: "success",
    })

    logger?.info(
      `[paytr/callback] Ödeme başarıyla işlendi — session=${session.id} merchant_oid=${merchantOid}`
    )
    await recordOpsEvent(req.scope, {
      kind: "payment.succeeded",
      level: "info",
      title: `PayTR ödemesi alındı — ${amountMajor.toFixed(2)} TL`,
      orderId,
      data: { merchant_oid: merchantOid, amount: amountMajor },
    })
    return
  }

  // status === "failed" (veya success dışı)
  //
  // Sipariş İPTAL EDİLMEZ, callback_processed YAZILMAZ. PayTR 3D Secure başarısız
  // olunca müşteriye aynı merchant_oid ile tekrar deneme sunar; ikinci deneme
  // success gelince yukarıdaki yoldan capture olur. (Mareen'de failed'da iptal +
  // idempotency kilidi yüzünden para çekildi, sipariş iptal kaldı: #201, #130.)
  // Vazgeçen müşterinin siparişi temizlik işinde iptal olur; son deneme zamanı
  // (paytr_last_failed_at) işin süresini yeniler.
  const attempts = await recordFailedAttempt(req.scope, session, {
    code: failedReasonCode,
    msg: failedReasonMsg,
  })

  logger?.warn(
    `[paytr/callback] Ödeme denemesi başarısız (${attempts}. deneme) — session=${session.id} ` +
      `order=${orderId || "-"} reason: ${failedReasonCode} / ${failedReasonMsg} — sipariş açık, iptal yok`
  )
  await recordOpsEvent(req.scope, {
    kind: "payment.failed",
    level: "warning",
    title: `PayTR ödeme denemesi başarısız (${attempts}. deneme) — sipariş açık`,
    detail:
      `Sebep (${failedReasonCode || "?"}): ${failedReasonMsg || "bilinmiyor"}. ` +
      "Müşteri aynı ödeme oturumunda tekrar deneyebilir; vazgeçerse temizlik işi iptal eder.",
    orderId,
    data: {
      merchant_oid: merchantOid,
      attempts,
      reason_code: failedReasonCode,
      reason: failedReasonMsg,
    },
  })
}

async function compensateOrThrow(
  req: MedusaRequest,
  input: {
    kind: PaytrSuccessAnomalyKind
    merchantOid: string
    session: PaymentSessionLike
    totalAmount: string
    orderId?: string | null
    detail: string
  }
) {
  const logger = req.scope.resolve("logger")
  // Tutarsız success'te varsayılan: iade YOK — para PayTR'de tutulur, uyarı maili
  // gider, admin siparişi yeniden açar ya da panelden iade eder. (Mareen: cutover'da
  // DNS yayılırken callback ulaşamadı, gerçek sipariş #9 cleanup ile iptal oldu;
  // otomatik iade gerçek siparişin parasını iade edecekti. Taksitli #14'te tutar
  // kontrolü yanlış alarm verdi.) Eski otomatik iade: PAYTR_CALLBACK_AUTO_REFUND=1.
  const holdForManualReview = !callbackAutoRefundEnabled()

  await sendPaytrCriticalAlert(req.scope, {
    kind: input.kind,
    merchantOid: input.merchantOid,
    orderId: input.orderId,
    sessionId: input.session.id,
    callbackAmountKurus: input.totalAmount,
    sessionAmount: String(input.session.amount ?? ""),
    detail: holdForManualReview
      ? `${input.detail} — OTOMATİK İADE YAPILMADI: para PayTR'de. Siparişi elle yeniden oluşturun veya PayTR panelinden iade edin.`
      : input.detail,
  })

  if (holdForManualReview) {
    // callback_processed=true: aynı success tekrar gelirse no-op. manual_review=true:
    // temizlik işi bu siparişe dokunmaz (para PayTR'de olabilir).
    await markCallbackProcessed(req.scope, input.session, {
      paytr_status: manualReviewStatusFor(input.kind),
      manual_review: true,
      manual_review_kind: input.kind,
      paytr_webhook_at: new Date().toISOString(),
    })
    logger?.warn(
      `[paytr/callback] Tutarsız success (${input.kind}) — iade yapılmadı, elle incelenecek oid=${input.merchantOid} order=${input.orderId || "-"}: ${input.detail}`
    )
    return
  }

  const refund = await compensatePaytrCharge({
    merchantOid: input.merchantOid,
    callbackKurus: input.totalAmount,
    reason: input.kind,
  })

  if (!refund.ok) {
    await sendPaytrCriticalAlert(req.scope, {
      kind: "compensate_failed",
      merchantOid: input.merchantOid,
      orderId: input.orderId,
      sessionId: input.session.id,
      callbackAmountKurus: input.totalAmount,
      sessionAmount: String(input.session.amount ?? ""),
      detail: refund.message,
    })
    throw new PaytrCallbackProcessError(
      `compensate failed oid=${input.merchantOid}: ${refund.message}`
    )
  }

  await markCallbackProcessed(req.scope, input.session, {
    paytr_status: "compensated",
    compensate_kind: input.kind,
    compensate_amount: refund.returnAmount,
    compensate_reference: refund.referenceNo,
  })
  logger?.info(
    `[paytr/callback] Compensated ${input.kind} oid=${input.merchantOid} ` +
      `ref=${refund.referenceNo} amount=${refund.returnAmount}`
  )
}
