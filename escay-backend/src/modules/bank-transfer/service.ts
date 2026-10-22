import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"

type InjectedDependencies = {
  logger: Logger
}

type BankTransferSessionData = {
  session_id?: string
  /** "pending" → admin "Havale alındı" → "received" */
  bank_transfer_status?: "pending" | "received" | "canceled"
  received_at?: string
  received_by?: string
  /** Elle yapılan iadeler (banka üzerinden geri gönderim) */
  manual_refunds?: { amount: number; at: string }[]
  [key: string]: unknown
}

/**
 * Havale / EFT payment provider.
 *
 * Provider id in Medusa: pp_havale_havale
 *
 * Sipariş cart.complete'de pending_authorization ile oluşur (PayTR gibi).
 * Ödeme onayı yalnızca admin'deki "Havale alındı" butonundan gelir:
 * POST /admin/orders/:id/bank-transfer/confirm → session'a "received" yazılır
 * → processPaymentWorkflow SUCCESSFUL → authorize + capture → payment.captured
 * (onay maili, kargo, Paraşüt mevcut subscriber'larla).
 *
 * Otomatik iptal YOK — cancel-unpaid-paytr-orders yalnızca PayTR session'larına bakar.
 */
class BankTransferProviderService extends AbstractPaymentProvider {
  static identifier = "havale"

  protected logger_: Logger

  constructor(container: InjectedDependencies, options: Record<string, unknown>) {
    super(container, options)
    this.logger_ = container.logger
  }

  async initiatePayment(
    _input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const sessionId = `havale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return {
      id: sessionId,
      status: PaymentSessionStatus.PENDING,
      data: {
        session_id: sessionId,
        bank_transfer_status: "pending",
      } satisfies BankTransferSessionData,
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = (input.data || {}) as BankTransferSessionData
    if (data.bank_transfer_status === "received") {
      return { status: PaymentSessionStatus.AUTHORIZED, data: { ...data } }
    }
    return {
      status: PaymentSessionStatus.PENDING_AUTHORIZATION,
      data: {
        ...data,
        note: "Havale onayı admin'den gelecek",
      },
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = (input.data || {}) as BankTransferSessionData
    return {
      data: {
        ...data,
        bank_transfer_status: "received",
        captured_at: new Date().toISOString(),
      },
    }
  }

  /**
   * Havale iadesi otomatik değildir: Medusa iadeyi kaydeder, para müşterinin
   * IBAN'ına bankadan elle gönderilir.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = { ...((input.data || {}) as BankTransferSessionData) }
    const amount = Number(input.amount ?? 0)
    this.logger_.warn(
      `[havale] refundPayment — ${amount} TL iade kaydedildi; para bankadan ELLE gönderilmeli (session=${data.session_id})`
    )
    data.manual_refunds = [
      ...(data.manual_refunds || []),
      { amount, at: new Date().toISOString() },
    ]
    return { data }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return {
      data: {
        ...((input.data || {}) as BankTransferSessionData),
        bank_transfer_status: "canceled",
        cancelled_at: new Date().toISOString(),
      },
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return { data: (input.data as Record<string, unknown>) || {} }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data || {}) as BankTransferSessionData
    if (data.bank_transfer_status === "received") {
      return { status: PaymentSessionStatus.CAPTURED }
    }
    if (data.bank_transfer_status === "canceled") {
      return { status: PaymentSessionStatus.CANCELED }
    }
    return { status: PaymentSessionStatus.PENDING }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return { data: (input.data as Record<string, unknown>) || {} }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    return {
      data: {
        ...((input.data as Record<string, unknown>) || {}),
        amount: input.amount,
        currency_code: input.currency_code,
      },
    }
  }

  /** Havale'nin webhook'u yok — onay admin route'undan gelir. */
  async getWebhookActionAndData(
    _payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}

export default BankTransferProviderService
