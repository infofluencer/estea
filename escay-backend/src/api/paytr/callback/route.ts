import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { recordOpsEvent } from "../../../lib/ops-events"
import {
  Modules,
  PaymentActions,
} from "@medusajs/framework/utils"
import { callbackAmountMatchesSession, verifyCallbackHash } from "../../../modules/paytr/hash"
import { isPaytrMockEnabled } from "../../../modules/paytr/mock-iade"
import {
  cancelUnpaidOrderIfSafe,
  findOrderIdForPaymentSession,
  findPaymentSessionByMerchantOid,
  markCallbackProcessed,
  paytrCallbackLockKey,
  resolvePaymentModule,
  retrieveOrderForCancelGuard,
  type PaymentSessionLike,
} from "../../../modules/paytr/order-guards"
import {
  compensatePaytrCharge,
  sendPaytrCriticalAlert,
} from "../../../lib/paytr-compensate"

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
 * 3. İdempotency: aynı merchant_oid ikinci gelişte işlem yapma, OK dön.
 * 4. Hash geçersizse "PAYTR notification failed: bad hash" → PayTR retry yapmaz.
 * 5. FAILED → unpaid order cancelOrderWorkflow (stok Medusa core ile serbest).
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
  // tutarı payment_amount'tur. Tutar kontrolü ve capture payment_amount ile yapılır.
  const paymentAmount = body.payment_amount || totalAmount
  const incomingHash = body.hash || ""
  const failedReasonCode = body.failed_reason_code || ""
  const failedReasonMsg = body.failed_reason_msg || ""

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
    const locking = req.scope.resolve(Modules.LOCKING) as {
      execute: <T>(
        keys: string | string[],
        job: () => Promise<T>,
        args?: { timeout?: number; ttl?: number }
      ) => Promise<T>
    }

    await locking.execute(
      paytrCallbackLockKey(merchantOid),
      async () => {
        await processPaytrCallback(req, {
          merchantOid,
          status,
          paymentAmount,
          failedReasonCode,
          failedReasonMsg,
        })
      },
      { timeout: 30, ttl: 120 }
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

/**
 * Persist PayTR success on the session BEFORE processPaymentWorkflow so
 * authorizePayment returns AUTHORIZED (Medusa SUCCESSFUL path: authorize → capture).
 * callback_processed stays false until after the workflow (idempotency gate).
 */
async function markPaytrWebhookSuccess(
  req: MedusaRequest,
  session: PaymentSessionLike
): Promise<PaymentSessionLike> {
  const payment = resolvePaymentModule(req.scope)
  const prev = (session.data || {}) as Record<string, unknown>
  await payment.updatePaymentSession({
    id: session.id,
    currency_code: String(session.currency_code || "try"),
    amount: session.amount ?? 0,
    data: {
      ...prev,
      paytr_status: "success",
      paytr_webhook_at: new Date().toISOString(),
    },
  })
  return (await payment.retrievePaymentSession(session.id)) as PaymentSessionLike
}

async function processPaytrCallback(
  req: MedusaRequest,
  input: {
    merchantOid: string
    status: string
    paymentAmount: string
    failedReasonCode: string
    failedReasonMsg: string
  }
) {
  const logger = req.scope.resolve("logger")
  const { merchantOid, status, paymentAmount, failedReasonCode, failedReasonMsg } =
    input
  const totalAmount = paymentAmount

  let session = await findPaymentSessionByMerchantOid(req.scope, merchantOid)

  if (!session) {
    logger?.warn(
      `[paytr/callback] Session bulunamadı — merchant_oid=${merchantOid}. OK (idempotency veya geç callback).`
    )
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
    session = await markPaytrWebhookSuccess(req, session)

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
  try {
    await processPaymentWorkflow(req.scope).run({
      input: {
        action: PaymentActions.FAILED,
        data: {
          session_id: session.id,
          amount: amountMajor,
        },
      },
    })
  } catch (err) {
    // Medusa process-payment FAILED dalı çoğunlukla no-op; hata olursa yine cancel deneriz
    logger?.warn(
      `[paytr/callback] processPaymentWorkflow FAILED (devam): ${formatUnknownError(err)}`
    )
  }

  if (orderId) {
    await cancelUnpaidOrderIfSafe(
      req.scope,
      orderId,
      `[paytr/callback] FAIL cancel`
    )
  } else {
    logger?.warn(
      `[paytr/callback] FAILED — order bulunamadı session=${session.id} oid=${merchantOid}`
    )
  }

  session = (await payment.retrievePaymentSession(session.id)) as PaymentSessionLike
  await markCallbackProcessed(req.scope, session, {
    paytr_status: "failed",
    failed_reason: `${failedReasonCode} ${failedReasonMsg}`.trim(),
  })

  logger?.warn(
    `[paytr/callback] Ödeme başarısız işlendi — session=${session.id} reason: ${failedReasonCode} / ${failedReasonMsg}`
  )
  await recordOpsEvent(req.scope, {
    kind: "payment.failed",
    level: "warning",
    title: `PayTR ödemesi başarısız — sipariş iptal`,
    detail: `Sebep (${failedReasonCode || "?"}): ${failedReasonMsg || "bilinmiyor"}`,
    orderId,
    data: { merchant_oid: merchantOid, reason_code: failedReasonCode, reason: failedReasonMsg },
  })
}

async function compensateOrThrow(
  req: MedusaRequest,
  input: {
    kind: "late_success_canceled" | "amount_mismatch" | "success_no_order"
    merchantOid: string
    session: PaymentSessionLike
    totalAmount: string
    orderId?: string | null
    detail: string
  }
) {
  const logger = req.scope.resolve("logger")
  // İptal edilmiş siparişe geç success: varsayılan olarak iade YOK — para tutulur,
  // sipariş elle yeniden açılır. (Cutover'da DNS yayılırken callback ulaşamadı, gerçek
  // sipariş #9 cleanup ile iptal oldu.) Eski davranış: PAYTR_LATE_SUCCESS_AUTO_REFUND=1.
  const holdForManualReview =
    input.kind === "late_success_canceled" &&
    process.env.PAYTR_LATE_SUCCESS_AUTO_REFUND !== "1"

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
    await markCallbackProcessed(req.scope, input.session, {
      paytr_status: "success_on_canceled_order",
      manual_review: true,
      paytr_webhook_at: new Date().toISOString(),
    })
    logger?.warn(
      `[paytr/callback] Geç success iptal siparişte — iade yapılmadı, elle işlenecek oid=${input.merchantOid} order=${input.orderId || "-"}`
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
