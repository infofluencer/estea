import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import FormData from "form-data"
import { COMPANY } from "../emails/company"
import { recordOpsEvent } from "./ops-events"
import { buildPaytrCriticalAlertEmail, type PaytrCriticalAlertData } from "../emails/paytr-alerts"
import {
  buildRefundReferenceNo,
  computeRefundHash,
  formatPaytrReturnAmount,
  paytrOidPrefix,
} from "../modules/paytr/hash"
import {
  isPaytrMockEnabled,
  mockPaytrIadeFetch,
} from "../modules/paytr/mock-iade"
import { createNotificationIdempotent } from "./notify"

/**
 * PayTR tahsilatı var, Medusa siparişi iptal/yok/tutarsız — /odeme/iade.
 * Medusa refund workflow kullanmaz (henüz capture olmamış olabilir).
 *
 * Gerçek HTTP yalnızca: mock kapalı VE (prod öneksiz VEYA test_mode=1).
 * test_mode=0 + önek → reddedilir (canlı dışı ortamda canlı iade yok).
 */
export async function compensatePaytrCharge(input: {
  merchantOid: string
  /** PayTR callback total_amount — kuruş */
  callbackKurus: string
  reason: string
}): Promise<{ ok: true; returnAmount: string; referenceNo: string } | { ok: false; message: string }> {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() || ""
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() || ""
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() || ""
  if (!merchantId || !merchantKey || !merchantSalt) {
    return { ok: false, message: "PAYTR_* credentials eksik" }
  }

  const prefix = paytrOidPrefix()
  const testMode = (process.env.PAYTR_TEST_MODE ?? "1").trim()
  if (prefix && !isPaytrMockEnabled() && testMode !== "1") {
    return {
      ok: false,
      message: `PAYTR_OID_PREFIX=${prefix} ve PAYTR_TEST_MODE=${testMode} — gerçek iade yok`,
    }
  }

  const kurus = Number(input.callbackKurus)
  if (!Number.isFinite(kurus) || kurus <= 0) {
    return { ok: false, message: `Geçersiz callback tutarı: ${input.callbackKurus}` }
  }

  const returnAmount = formatPaytrReturnAmount(kurus / 100)
  const referenceNo = buildRefundReferenceNo(
    input.merchantOid,
    returnAmount,
    0
  )
  const result = await postPaytrRefund({ merchantOid: input.merchantOid, returnAmount, referenceNo })
  return result.ok ? { ok: true, returnAmount, referenceNo } : result
}

/**
 * Ham /odeme/iade isteği (PAYTR_MOCK=1 ise sahte). Ortam/önek kontrolü çağırana aittir.
 * returnAmount: TL, nokta ayraçlı ("199.90").
 */
export async function postPaytrRefund(input: {
  merchantOid: string
  returnAmount: string
  referenceNo: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim() || ""
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim() || ""
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim() || ""
  if (!merchantId || !merchantKey || !merchantSalt) {
    return { ok: false, message: "PAYTR_* credentials eksik" }
  }
  const paytrToken = computeRefundHash({
    merchantId,
    merchantOid: input.merchantOid,
    returnAmount: input.returnAmount,
    merchantSalt,
    merchantKey,
  })

  const form = new FormData()
  form.append("merchant_id", merchantId)
  form.append("merchant_oid", input.merchantOid)
  form.append("return_amount", input.returnAmount)
  form.append("paytr_token", paytrToken)
  form.append("reference_no", input.referenceNo)

  const iadeUrl = "https://www.paytr.com/odeme/iade"
  try {
    const response = isPaytrMockEnabled()
      ? await mockPaytrIadeFetch(iadeUrl, {
          method: "POST",
          body: form.getBuffer() as unknown as BodyInit,
          headers: form.getHeaders() as Record<string, string>,
        })
      : await globalThis.fetch(iadeUrl, {
          method: "POST",
          body: form.getBuffer() as unknown as BodyInit,
          headers: form.getHeaders() as Record<string, string>,
        })
    const text = await response.text()
    let json: { status?: string; err_msg?: string; reason?: string }
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, message: `iade JSON değil HTTP ${response.status}` }
    }
    if (json.status !== "success") {
      return {
        ok: false,
        message: json.err_msg || json.reason || "PayTR iade başarısız",
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function sendPaytrCriticalAlert(
  container: MedusaContainer,
  data: PaytrCriticalAlertData
): Promise<void> {
  const logger = container.resolve("logger") as {
    error: (m: string) => void
    warn: (m: string) => void
  }
  logger.error(
    `[paytr-alert] ${data.kind} oid=${data.merchantOid} order=${data.orderId || "-"} ${data.detail || ""}`
  )
  await recordOpsEvent(container, {
    kind: "payment.alert",
    level: "error",
    title: `PayTR kritik durum: ${data.kind}`,
    detail: data.detail || null,
    orderId: data.orderId || null,
    data: { merchant_oid: data.merchantOid, kind: data.kind },
  })
  try {
    const mail = buildPaytrCriticalAlertEmail(data)
    const notification = container.resolve(Modules.NOTIFICATION)
    const to =
      process.env.PAYTR_ALERT_INBOX ||
      process.env.RETURNS_INBOX ||
      process.env.CONTACT_INBOX ||
      COMPANY.emailOps
    await createNotificationIdempotent(notification, {
      to,
      channel: "email",
      template: `paytr-critical-${data.kind}`,
      content: {
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      },
      resource_id: data.merchantOid,
      resource_type: "paytr_callback",
      idempotency_key: `paytr-critical:${data.kind}:${data.merchantOid}`,
    })
  } catch (err) {
    logger.warn(
      `[paytr-alert] mail gönderilemedi oid=${data.merchantOid}: ${String(err)}`
    )
  }
}
