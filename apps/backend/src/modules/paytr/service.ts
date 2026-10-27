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
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
  Logger,
} from "@medusajs/framework/types"
import FormData from "form-data"
import {
  buildMerchantOid,
  buildRefundReferenceNo,
  buildUserBasket,
  computeRefundHash,
  computeTokenHash,
  formatPaytrReturnAmount,
  paytrOidPrefix,
  sanitizeEmail,
} from "./hash"
import {
  isPaytrMockEnabled,
  mockPaytrIadeFetch,
} from "./mock-iade"

type PaytrOptions = {
  merchantId?: string
  merchantKey?: string
  merchantSalt?: string
  testMode?: string
  storefrontUrl?: string
}

type InjectedDependencies = {
  logger: Logger
}

type PaytrSessionData = {
  session_id: string
  merchant_oid: string
  iframe_token?: string
  paytr_status?: "success" | "failed" | "pending"
  callback_processed?: boolean
  failed_reason?: string
  /** Başarılı PayTR iadeleri (idempotency + audit) */
  paytr_refunds?: PaytrRefundRecord[]
  [key: string]: unknown
}

type PaytrRefundRecord = {
  reference_no: string
  return_amount: string
  status: "success"
  at: string
}

type PaytrRefundApiResponse = {
  status?: string
  merchant_oid?: string
  return_amount?: string
  reference_no?: string
  err_no?: string | number
  err_msg?: string
  msg?: string
  reason?: string
}

/**
 * PayTR iFrame API payment provider.
 *
 * Provider id in Medusa: pp_paytr_paytr
 *
 * ÖNEMLI: Sipariş onayı SADECE /paytr/callback webhook'undan yapılır.
 * Tarayıcı yönlendirme URL'si (ok_url) onay DEĞİLDİR.
 */
class PaytrProviderService extends AbstractPaymentProvider<PaytrOptions> {
  static identifier = "paytr"

  protected logger_: Logger
  protected options_: PaytrOptions

  constructor(container: InjectedDependencies, options: PaytrOptions) {
    super(container, options)
    this.logger_ = container.logger
    this.options_ = options
  }

  static validateOptions(options: Record<string, unknown>) {
    const required = ["merchantId", "merchantKey", "merchantSalt"] as const
    for (const key of required) {
      if (!options[key]) {
        console.warn(
          `[paytr] Missing option "${key}". Set PAYTR_* env vars before production.`
        )
      }
    }
  }

  private get merchantId(): string {
    return this.options_.merchantId || ""
  }
  private get merchantKey(): string {
    return this.options_.merchantKey || ""
  }
  private get merchantSalt(): string {
    return this.options_.merchantSalt || ""
  }
  private get testMode(): string {
    return this.options_.testMode ?? "1"
  }
  private get storefrontUrl(): string {
    return (this.options_.storefrontUrl || "http://localhost:3015").replace(/\/$/, "")
  }

  /** PayTR get-token debug_on — prod'da 0; test_mode / staging öneki / PAYTR_DEBUG_ON=1 iken 1. */
  private get debugOn(): string {
    const forced = (process.env.PAYTR_DEBUG_ON || "").trim().toLowerCase()
    if (forced === "1" || forced === "true") return "1"
    if (forced === "0" || forced === "false") return "0"
    if (this.testMode === "1" || paytrOidPrefix()) return "1"
    return "0"
  }

  // ─────────────────────────────────────────────────────────────────
  // Adım 1 — iFrame token alma
  // ─────────────────────────────────────────────────────────────────

  /**
   * PayTR iFrame ödeme oturumu başlat.
   *
   * input.context?.customer'dan email, ad, telefon alınır.
   * input.data['user_ip'] ve input.data['cart_items'] storefront'tan iletilir.
   *
   * Dönen data.iframe_token ile storefront iFrame URL'ini oluşturur:
   *   https://www.paytr.com/odeme/guvenli/{iframe_token}
   */
  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const { amount, currency_code } = input
    const data = (input.data || {}) as Record<string, unknown>
    const customer = input.context?.customer

    // session_id: Medusa tarafından dışarıdan atanmaz; benzersiz id üretiyoruz
    const sessionId = `payses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const merchantOid = buildMerchantOid(sessionId)

    // payment_amount: kuruş (TL × 100, tamsayı)
    const amountNum = typeof amount === "number" ? amount : Number(amount)
    const paymentAmount = Math.round(amountNum * 100)

    // email — Türkçe karakter temizle
    const rawEmail =
      (data["customer_email"] as string) ||
      customer?.email ||
      "no-reply@esteacay.com"
    const email = sanitizeEmail(rawEmail)

    // kullanıcı bilgileri
    const firstName = customer?.first_name || (data["first_name"] as string) || ""
    const lastName = customer?.last_name || (data["last_name"] as string) || ""
    const userName = `${firstName} ${lastName}`.trim() || "Müşteri"
    const userPhone = (data["phone"] as string) || customer?.phone || "05000000000"
    const userAddress = (data["address"] as string) || "Türkiye"

    // user_ip: dış IP. Lokal testte PAYTR_USER_IP env ile override edilebilir.
    const userIp =
      (data["user_ip"] as string) ||
      process.env.PAYTR_USER_IP ||
      "1.2.3.4"

    // user_basket — cart items varsa kullan
    const cartItems = data["cart_items"] as
      | { name: string; unit_price: number; quantity: number }[]
      | undefined

    const basketItems = cartItems?.length
      ? cartItems.map((i) => ({
          name: i.name,
          unitPrice: i.unit_price,
          quantity: i.quantity,
        }))
      : [{ name: "Sipariş", unitPrice: amountNum, quantity: 1 }]

    const userBasket = buildUserBasket(basketItems)

    const currency = currency_code?.toUpperCase() === "TRY" ? "TL" : (currency_code?.toUpperCase() || "TL")
    const noInstallment = "0"
    const maxInstallment = "0"

    // Başarı / hata URL'leri
    const merchantOkUrl = `${this.storefrontUrl}/odeme/payment-result?status=success&oid=${merchantOid}`
    const merchantFailUrl = `${this.storefrontUrl}/odeme/payment-result?status=failed&oid=${merchantOid}`

    // paytr_token hash hesapla
    const paytrToken = computeTokenHash({
      merchantId: this.merchantId,
      userIp,
      merchantOid,
      email,
      paymentAmount,
      userBasket,
      noInstallment,
      maxInstallment,
      currency,
      testMode: this.testMode,
      merchantSalt: this.merchantSalt,
      merchantKey: this.merchantKey,
    })

    if (
      !this.merchantId ||
      !this.merchantKey ||
      !this.merchantSalt ||
      isPaytrMockEnabled()
    ) {
      this.logger_.warn(
        isPaytrMockEnabled()
          ? "[paytr] PAYTR_MOCK=1 — stub payment session (no get-token HTTP)"
          : "[paytr] Credentials missing — returning stub session (no real API call)"
      )
      return {
        id: sessionId,
        status: PaymentSessionStatus.PENDING,
        data: {
          session_id: sessionId,
          merchant_oid: merchantOid,
          iframe_token: undefined,
          paytr_status: "pending",
          callback_processed: false,
          _stub: true,
        } satisfies Partial<PaytrSessionData>,
      }
    }

    if (paytrOidPrefix() && this.testMode !== "1") {
      throw new Error(
        `[paytr] PAYTR_OID_PREFIX=${paytrOidPrefix()} (canlı dışı ortam) iken ` +
          `test_mode=${this.testMode} ile get-token reddedildi — PAYTR_TEST_MODE=1 olmalı.`
      )
    }

    // PayTR get-token isteği
    let iframeToken: string | null = null
    try {
      const form = new FormData()
      form.append("merchant_id", this.merchantId)
      form.append("user_ip", userIp)
      form.append("merchant_oid", merchantOid)
      form.append("email", email)
      form.append("payment_amount", String(paymentAmount))
      form.append("paytr_token", paytrToken)
      form.append("user_basket", userBasket)
      form.append("debug_on", this.debugOn)
      form.append("no_installment", noInstallment)
      form.append("max_installment", maxInstallment)
      form.append("user_name", userName.slice(0, 60))
      form.append("user_address", userAddress.slice(0, 400))
      form.append("user_phone", userPhone.slice(0, 20))
      form.append("merchant_ok_url", merchantOkUrl.slice(0, 400))
      form.append("merchant_fail_url", merchantFailUrl.slice(0, 400))
      form.append("timeout_limit", "30")
      form.append("currency", currency)
      form.append("test_mode", this.testMode)
      form.append("lang", "tr")

      const formBuffer = form.getBuffer()
      const formHeaders = form.getHeaders() as Record<string, string>

      const response = await globalThis.fetch(
        "https://www.paytr.com/odeme/api/get-token",
        {
          method: "POST",
          body: formBuffer as unknown as BodyInit,
          headers: formHeaders,
        }
      )

      const json = (await response.json()) as {
        status: string
        token?: string
        reason?: string
      }

      if (json.status === "success" && json.token) {
        iframeToken = json.token
        this.logger_.info(
          `[paytr] Token alındı — merchant_oid=${merchantOid} session=${sessionId}`
        )
      } else {
        this.logger_.error(
          `[paytr] get-token başarısız — reason: ${json.reason || "bilinmiyor"}`
        )
        throw new Error(`PayTR token alınamadı: ${json.reason || "bilinmiyor"}`)
      }
    } catch (err) {
      this.logger_.error(`[paytr] get-token isteği hatası: ${String(err)}`)
      throw err
    }

    return {
      id: sessionId,
      status: PaymentSessionStatus.PENDING,
      data: {
        session_id: sessionId,
        merchant_oid: merchantOid,
        iframe_token: iframeToken,
        paytr_status: "pending",
        // Callback route locks + sets callback_processed=true after SUCCESS/FAILED
        // (see api/paytr/callback/route.ts + order-guards.markCallbackProcessed).
        callback_processed: false,
      } satisfies Partial<PaytrSessionData>,
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Adım 2 — cart complete path (async webhook bekle)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Checkout cart complete'de çağrılır.
   * PayTR asenkron çalışır — gerçek onay callback'te gelir.
   * pending_authorization döndürerek Medusa'ya "webhook bekle" deriz.
   */
  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const data = (input.data || {}) as PaytrSessionData

    // PayTR success signaled on session (callback route sets paytr_status before
    // processPaymentWorkflow SUCCESSFUL → authorize → capture).
    if (data.paytr_status === "success") {
      this.logger_.info(
        `[paytr] authorizePayment: AUTHORIZED — merchant_oid=${data.merchant_oid}`
      )
      return {
        status: PaymentSessionStatus.AUTHORIZED,
        data: { ...data },
      }
    }

    this.logger_.info(
      `[paytr] authorizePayment: pending_authorization — webhook bekleniyor (merchant_oid=${data.merchant_oid})`
    )
    return {
      status: PaymentSessionStatus.PENDING_AUTHORIZATION,
      data: {
        ...data,
        note: "Ödeme onayı PayTR callback webhook'undan gelecek",
      },
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const data = (input.data || {}) as PaytrSessionData
    this.logger_.info(
      `[paytr] capturePayment — merchant_oid=${data.merchant_oid}`
    )
    return {
      data: {
        ...data,
        paytr_status: "success",
        captured_at: new Date().toISOString(),
      },
    }
  }

  /**
   * PayTR iade (/odeme/iade) — Medusa native refund flow bunu çağırır.
   *
   * - merchant_oid: payment session data'dan
   * - return_amount: Medusa major-unit TRY → "199.90" (iade API kuruş DEĞİL;
   *   get-token'daki ×100 yalnızca ödeme alma tarafına özel)
   * - Senkron JSON yanıt; status !== success → throw (Medusa refund fail)
   * - Idempotency: aynı reference_no ile daha önce success kaydı varsa API'ye
   *   tekrar gitmeden success döner (payment data.paytr_refunds).
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = { ...((input.data || {}) as PaytrSessionData) }
    const merchantOid = String(data.merchant_oid || "")

    if (!merchantOid) {
      throw new Error(
        "PayTR iade başarısız: payment data'da merchant_oid yok."
      )
    }

    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new Error(
        "PayTR iade başarısız: merchant credentials eksik (PAYTR_* env)."
      )
    }

    // /odeme/iade'nin test_mode parametresi yok; canlı dışı ortamda gerçek iade atılmaz.
    if (paytrOidPrefix() && !isPaytrMockEnabled()) {
      throw new Error(
        `PayTR iade reddedildi: PAYTR_OID_PREFIX=${paytrOidPrefix()} (canlı dışı ortam) ` +
          "iken gerçek /odeme/iade isteği atılmaz. PAYTR_MOCK=1 kullanın."
      )
    }

    const returnAmount = formatPaytrReturnAmount(input.amount)
    const priorRefunds = Array.isArray(data.paytr_refunds)
      ? [...data.paytr_refunds]
      : []
    const referenceNo = buildRefundReferenceNo(
      merchantOid,
      returnAmount,
      priorRefunds.length
    )

    // Aynı reference_no + tutar ile success kaydı varsa PayTR'a tekrar gitme
    // (retry / Medusa re-entry; kasıtlı yeni kısmi iade yeni slot → yeni ref).
    const alreadyDone = priorRefunds.find(
      (r) =>
        r.reference_no === referenceNo &&
        r.return_amount === returnAmount &&
        r.status === "success"
    )
    if (alreadyDone) {
      this.logger_.info(
        `[paytr] refundPayment idempotent hit — merchant_oid=${merchantOid} ` +
          `return_amount=${returnAmount} reference_no=${referenceNo}`
      )
      return { data }
    }

    const paytrToken = computeRefundHash({
      merchantId: this.merchantId,
      merchantOid,
      returnAmount,
      merchantSalt: this.merchantSalt,
      merchantKey: this.merchantKey,
    })

    this.logger_.info(
      `[paytr] refundPayment — merchant_oid=${merchantOid} ` +
        `return_amount=${returnAmount} reference_no=${referenceNo}`
    )

    let json: PaytrRefundApiResponse
    try {
      const form = new FormData()
      form.append("merchant_id", this.merchantId)
      form.append("merchant_oid", merchantOid)
      form.append("return_amount", returnAmount)
      form.append("paytr_token", paytrToken)
      form.append("reference_no", referenceNo)

      const formBuffer = form.getBuffer()
      const formHeaders = form.getHeaders() as Record<string, string>

      const iadeUrl = "https://www.paytr.com/odeme/iade"
      const response = isPaytrMockEnabled()
        ? await mockPaytrIadeFetch(iadeUrl, {
            method: "POST",
            body: formBuffer as unknown as BodyInit,
            headers: formHeaders,
          })
        : await globalThis.fetch(iadeUrl, {
            method: "POST",
            body: formBuffer as unknown as BodyInit,
            headers: formHeaders,
          })

      const text = await response.text()
      try {
        json = JSON.parse(text) as PaytrRefundApiResponse
      } catch {
        this.logger_.error(
          `[paytr] refundPayment geçersiz JSON — HTTP ${response.status}: ${text.slice(0, 300)}`
        )
        throw new Error(
          `PayTR iade yanıtı parse edilemedi (HTTP ${response.status}).`
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("PayTR iade")) {
        throw err
      }
      this.logger_.error(`[paytr] refundPayment istek hatası: ${String(err)}`)
      throw new Error(`PayTR iade isteği başarısız: ${String(err)}`)
    }

    if (json.status === "success") {
      const record: PaytrRefundRecord = {
        reference_no: String(json.reference_no || referenceNo),
        return_amount: String(json.return_amount || returnAmount),
        status: "success",
        at: new Date().toISOString(),
      }
      priorRefunds.push(record)
      data.paytr_refunds = priorRefunds
      data.last_refund_at = record.at
      data.last_refund_amount = record.return_amount

      this.logger_.info(
        `[paytr] refundPayment success — merchant_oid=${merchantOid} ` +
          `return_amount=${record.return_amount} reference_no=${record.reference_no}`
      )

      return { data }
    }

    const errNo = json.err_no != null ? String(json.err_no) : ""
    const errMsg =
      json.err_msg || json.msg || json.reason || "bilinmeyen hata"

    this.logger_.error(
      `[paytr] refundPayment failed — merchant_oid=${merchantOid} ` +
        `err_no=${errNo} err_msg=${errMsg}`
    )
    throw new Error(
      `PayTR iade başarısız${errNo ? ` [${errNo}]` : ""}: ${errMsg}`
    )
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const data = (input.data || {}) as PaytrSessionData
    this.logger_.info(
      `[paytr] cancelPayment — merchant_oid=${data.merchant_oid}`
    )
    return {
      data: {
        ...data,
        paytr_status: "failed",
        cancelled_at: new Date().toISOString(),
      },
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    return {
      data: (input.data as Record<string, unknown>) || {},
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const data = (input.data || {}) as PaytrSessionData
    if (data.paytr_status === "success") {
      return { status: PaymentSessionStatus.CAPTURED }
    }
    if (data.paytr_status === "failed") {
      return { status: PaymentSessionStatus.ERROR }
    }
    return { status: PaymentSessionStatus.PENDING }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    return {
      data: (input.data as Record<string, unknown>) || {},
    }
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

  // ─────────────────────────────────────────────────────────────────
  // Webhook bridge (Medusa'nın standart webhook akışı için)
  // ─────────────────────────────────────────────────────────────────

  /**
   * PayTR callback verisini Medusa webhook action'ına çevirir.
   *
   * Bu metod Medusa'nın webhook router'ından değil, bizim
   * /paytr/callback route'undan processPaymentWorkflow aracılığıyla
   * kullanılır.  Hash doğrulama callback route'ta yapılır.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    const data = (payload.data || {}) as Record<string, unknown>

    const merchantOid = String(data.merchant_oid || "")
    const status = String(data.status || "")
    const totalAmount = Number(data.total_amount || 0)
    const sessionId = String(data.session_id || merchantOid)

    if (!merchantOid) {
      this.logger_.warn("[paytr] getWebhookActionAndData: merchant_oid yok")
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    if (status === "success") {
      this.logger_.info(
        `[paytr] webhook success — merchant_oid=${merchantOid} amount=${totalAmount}`
      )
      return {
        action: PaymentActions.SUCCESSFUL,
        data: {
          session_id: sessionId,
          amount: totalAmount,
        },
      }
    }

    this.logger_.warn(
      `[paytr] webhook failed — merchant_oid=${merchantOid} reason=${data.failed_reason_msg}`
    )
    return {
      action: PaymentActions.FAILED,
      data: {
        session_id: sessionId,
        amount: totalAmount,
      },
    }
  }
}

export default PaytrProviderService
