/**
 * PayTR ödeme denemeleri: sipariş ödeme başarılı olunca oluşur (docs/ESCAY-KARARLAR.md K11).
 *
 *   iframe açılır → paytr_checkout kaydı (registerPaytrCheckout), sepet açık kalır, stok düşmez
 *   success → para önce kayda yazılır → sipariş oluşturulur → tahsilat kaydedilir
 *   bildirim gelmezse → reconcilePaytrCheckouts PayTR durum sorgusuyla yakalar
 *
 * Sıra bilinçli: Medusa'nın processPaymentWorkflow'u önce capture edip sepeti sonra
 * tamamlar ve tamamlama hatasını yutar; capture edilmiş ödemede completeCart'ın telafisi
 * parayı PayTR'den otomatik iade etmeye çalışır. Burada önce sipariş, sonra tahsilat:
 * sipariş oluşamazsa para kayıtta `paid` kalır, uyarı gider, iş tekrar dener.
 */

import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  PaymentActions,
} from "@medusajs/framework/utils"
import {
  completeCartWorkflow,
  createPaymentSessionsWorkflow,
  processPaymentWorkflow,
} from "@medusajs/medusa/core-flows"
import { PAYTR_CHECKOUT_MODULE } from "../modules/paytr-checkout"
import type PaytrCheckoutModuleService from "../modules/paytr-checkout/service"
import {
  PAID_RETRY_MAX_AGE_MS,
  POLL_MAX_AGE_MS,
  currencyMatches,
  decideSettlement,
  isPollDue,
  itemsSignature,
  type CheckoutItem,
  type PaytrCheckoutStatus,
  type PaytrReviewKind,
} from "../modules/paytr-checkout/settle-rules"
import {
  computeAdoptToken,
  sessionAmountToKurus,
} from "../modules/paytr/hash"
import { isPaytrMockEnabled } from "../modules/paytr/mock-iade"
import {
  PAYTR_PROVIDER_ID,
  describeError,
  markCallbackProcessed,
  markPaytrSessionPaid,
  paytrCallbackLockKey,
  resolveLocking,
  resolvePaymentModule,
  type PaymentSessionLike,
} from "../modules/paytr/order-guards"
import { recordOpsEvent } from "./ops-events"
import { sendPaytrCriticalAlert } from "./paytr-compensate"
import { queryPaytrStatus, type PaytrStatusResult } from "./paytr-status"

const AMOUNT_TOLERANCE_KURUS = 1

export type PaytrCheckoutRecord = {
  id: string
  merchant_oid: string
  cart_id: string
  session_id?: string | null
  payment_collection_id?: string | null
  amount_kurus: number
  currency_code: string
  email?: string | null
  items?: CheckoutItem[] | null
  status: PaytrCheckoutStatus
  paid_at?: Date | string | null
  paid_kurus?: number | null
  paid_source?: string | null
  order_id?: string | null
  review_kind?: string | null
  last_error?: string | null
  failed_attempts: number
  retry_count: number
  last_polled_at?: Date | string | null
  alerted_at?: Date | string | null
  created_at: Date | string
}

type CartRow = {
  id: string
  email?: string | null
  currency_code?: string | null
  completed_at?: Date | string | null
  items?: { variant_id?: string | null; quantity?: unknown }[] | null
  payment_collection?: {
    id: string
    amount?: unknown
    payment_sessions?: {
      id: string
      provider_id?: string | null
      amount?: unknown
      data?: Record<string, unknown> | null
    }[] | null
  } | null
}

function service(container: MedusaContainer) {
  return container.resolve(PAYTR_CHECKOUT_MODULE) as PaytrCheckoutModuleService
}

function queryGraph(container: MedusaContainer) {
  return container.resolve(ContainerRegistrationKeys.QUERY) as unknown as {
    graph: (args: Record<string, unknown>) => Promise<{ data: unknown }>
  }
}

async function update(
  container: MedusaContainer,
  id: string,
  data: Partial<PaytrCheckoutRecord>
): Promise<void> {
  await service(container).updatePaytrCheckouts({ id, ...data } as never)
}

async function loadCart(container: MedusaContainer, cartId: string): Promise<CartRow | null> {
  const { data } = await queryGraph(container).graph({
    entity: "cart",
    fields: [
      "id",
      "email",
      "currency_code",
      "completed_at",
      "items.variant_id",
      "items.quantity",
      "payment_collection.id",
      "payment_collection.amount",
      "payment_collection.payment_sessions.id",
      "payment_collection.payment_sessions.provider_id",
      "payment_collection.payment_sessions.amount",
      "payment_collection.payment_sessions.data",
    ],
    filters: { id: cartId },
  })
  return ((data as CartRow[])?.[0] as CartRow | undefined) ?? null
}

type CartOrder = { id: string; canceled: boolean }

async function findCartOrder(container: MedusaContainer, cartId: string): Promise<CartOrder | null> {
  const { data } = await queryGraph(container).graph({
    entity: "order_cart",
    fields: ["order_id"],
    filters: { cart_id: cartId },
  })
  const orderId = (data as { order_id?: string }[])?.[0]?.order_id ?? null
  if (!orderId) return null
  const { data: orders } = await queryGraph(container).graph({
    entity: "order",
    fields: ["id", "status", "canceled_at"],
    filters: { id: orderId },
  })
  const order = (orders as { status?: string | null; canceled_at?: unknown }[])?.[0]
  return { id: orderId, canceled: order?.status === "canceled" || Boolean(order?.canceled_at) }
}

function findCartSession(cart: CartRow | null, merchantOid: string) {
  return (
    (cart?.payment_collection?.payment_sessions || []).find(
      (s) => s.provider_id === PAYTR_PROVIDER_ID && s.data?.merchant_oid === merchantOid
    ) ?? null
  )
}

export async function findPaytrCheckout(
  container: MedusaContainer,
  merchantOid: string
): Promise<PaytrCheckoutRecord | null> {
  if (!merchantOid) return null
  const rows = await service(container).listPaytrCheckouts({ merchant_oid: merchantOid }, { take: 1 })
  return ((rows as unknown as PaytrCheckoutRecord[])[0] as PaytrCheckoutRecord | undefined) ?? null
}

/**
 * Sepetin güncel PayTR oturumu için kalıcı kaydı açar. iframe gösterilmeden önce çağrılır;
 * aynı numara için tekrar çağrılırsa mevcut kaydı döner.
 */
export async function registerPaytrCheckout(
  container: MedusaContainer,
  cartId: string,
  /** Müşteriye gösterilecek iframe token'ı: kayıt bu token'ın oturumuna yazılır. */
  iframeToken?: string | null
): Promise<PaytrCheckoutRecord> {
  const cart = await loadCart(container, cartId)
  if (!cart) throw new PaytrCheckoutError("not_found", "Sepet bulunamadı.")
  if (cart.completed_at) throw new PaytrCheckoutError("not_allowed", "Sepet zaten tamamlanmış.")

  const sessions = (cart.payment_collection?.payment_sessions || []).filter(
    (s) => s.provider_id === PAYTR_PROVIDER_ID && typeof s.data?.merchant_oid === "string"
  )
  // Token verilmişse sepetin güncel oturumu o token'ı taşımalı: iki sekmede açılan ikinci
  // ekran ilk oturumu siler; eski ekrandan ödenen para kayıtsız kalmasın (stale_token).
  const session = iframeToken
    ? sessions.find((s) => s.data?.iframe_token === iframeToken) ?? null
    : sessions[0] ?? null
  if (!session) {
    throw new PaytrCheckoutError(
      iframeToken && sessions.length ? "stale_token" : "not_allowed",
      iframeToken && sessions.length
        ? "Ödeme ekranı yenilenmiş; lütfen ödemeye yeniden geçin."
        : "PayTR ödeme oturumu bulunamadı."
    )
  }
  return ensureCheckoutRecord(container, cart, session)
}

async function ensureCheckoutRecord(
  container: MedusaContainer,
  cart: CartRow,
  session: { id: string; amount?: unknown; data?: Record<string, unknown> | null }
): Promise<PaytrCheckoutRecord> {
  const merchantOid = String(session.data?.merchant_oid)
  const existing = await findPaytrCheckout(container, merchantOid)
  if (existing) return existing

  const amountKurus = sessionAmountToKurus(session.amount)
  if (amountKurus == null || amountKurus <= 0) {
    throw new PaytrCheckoutError("not_allowed", "Ödeme tutarı geçersiz.")
  }
  const items: CheckoutItem[] = (cart.items || [])
    .filter((i) => i.variant_id)
    .map((i) => ({ variant_id: String(i.variant_id), quantity: Number(i.quantity) || 0 }))

  const created = await service(container).createPaytrCheckouts({
    merchant_oid: merchantOid,
    cart_id: cart.id,
    session_id: session.id,
    payment_collection_id: cart.payment_collection?.id ?? null,
    amount_kurus: amountKurus,
    currency_code: cart.currency_code || "try",
    email: cart.email ?? null,
    items,
  } as never)
  return created as unknown as PaytrCheckoutRecord
}

/**
 * Kaydı olmayan ama sepete bağlı PayTR oturumu (kayıt adımı atlanmış) için kaydı oluşturur.
 * Oturum sepete bağlı değilse null.
 */
export async function ensureCheckoutForSession(
  container: MedusaContainer,
  session: PaymentSessionLike
): Promise<PaytrCheckoutRecord | null> {
  if (!session.payment_collection_id) return null
  const { data } = await queryGraph(container).graph({
    entity: "cart_payment_collection",
    fields: ["cart_id"],
    filters: { payment_collection_id: session.payment_collection_id },
  })
  const cartId = (data as { cart_id?: string }[])?.[0]?.cart_id
  if (!cartId) return null
  const cart = await loadCart(container, cartId)
  if (!cart) return null
  return ensureCheckoutRecord(container, cart, {
    id: session.id,
    amount: session.amount,
    data: session.data,
  })
}

/** Failed bildirim: yalnız sayaç. Aynı numarayla gelecek success normal işlenir. */
export async function recordPaytrCheckoutFailure(
  container: MedusaContainer,
  checkout: PaytrCheckoutRecord,
  reason: { code?: string | null; msg?: string | null }
): Promise<void> {
  if (checkout.status !== "pending" && checkout.status !== "expired") return
  const attempts = (checkout.failed_attempts || 0) + 1
  await update(container, checkout.id, {
    failed_attempts: attempts,
    last_error: `${reason.code || "?"} ${reason.msg || "bilinmiyor"}`.trim(),
  })
  await recordOpsEvent(container, {
    kind: "payment.failed",
    level: "warning",
    title: `PayTR ödeme denemesi başarısız (${attempts}. deneme)`,
    detail:
      `Sebep (${reason.code || "?"}): ${reason.msg || "bilinmiyor"}. ` +
      "Sipariş açılmadı; müşteri aynı ödeme ekranında tekrar deneyebilir.",
    data: { merchant_oid: checkout.merchant_oid, attempts, cart_id: checkout.cart_id },
  })
}

export type SettleResult =
  | { outcome: "completed"; orderId: string }
  | { outcome: "noop" }
  | { outcome: "review"; kind: PaytrReviewKind }
  | { outcome: "retry"; error: string }

/**
 * Başarılı ödemeyi sonuçlandırır. Çağıran paytrCallbackLockKey(oid) kilidini tutar.
 * Para kayda yazılamazsa throw eder (callback 500 döner, PayTR tekrar dener); kayda
 * yazıldıktan sonraki hatalar `retry` döner, iş tekrar dener.
 */
export type SettleInputSource = {
  paidKurus: number
  /** PayTR'nin bildirdiği para birimi ("TL"); yoksa karşılaştırılmaz */
  paidCurrency?: string | null
  source: "callback" | "status_query" | "session"
}

export async function settlePaytrCheckout(
  container: MedusaContainer,
  checkout: PaytrCheckoutRecord,
  input: SettleInputSource
): Promise<SettleResult> {
  // Aynı sepetin iki numarası aynı anda gelirse biri sipariş açar, diğeri çift ödeme olur.
  return resolveLocking(container).execute(
    `paytr-settle-cart:${checkout.cart_id}`,
    () => settleLocked(container, checkout, input),
    { timeout: 60, ttl: 180 }
  )
}

async function settleLocked(
  container: MedusaContainer,
  initial: PaytrCheckoutRecord,
  input: SettleInputSource
): Promise<SettleResult> {
  // Kilit beklerken başka akış sonuçlandırmış olabilir.
  const checkout = (await findPaytrCheckout(container, initial.merchant_oid)) ?? initial
  if (checkout.status === "completed" || checkout.status === "refunded" || checkout.status === "review") {
    return { outcome: "noop" }
  }

  const paidKurus = checkout.paid_kurus ?? input.paidKurus
  if (checkout.status !== "paid") {
    await update(container, checkout.id, {
      status: "paid",
      paid_at: new Date(),
      paid_kurus: paidKurus,
      paid_source: input.source,
    })
    checkout.status = "paid"
    checkout.paid_kurus = paidKurus
  }

  const logger = container.resolve("logger") as { info: (m: string) => void }
  let orderId: string | null = null
  let phase: "order" | "capture" = "order"

  try {
    const cart = await loadCart(container, checkout.cart_id)
    const cartOrder = await findCartOrder(container, checkout.cart_id)
    orderId = cartOrder?.id ?? null
    let session = findCartSession(cart, checkout.merchant_oid)

    const decision = decideSettlement({
      status: checkout.status,
      amountMatches: Math.abs(paidKurus - checkout.amount_kurus) <= AMOUNT_TOLERANCE_KURUS,
      currencyMatches: currencyMatches(input.paidCurrency, checkout.currency_code),
      cartExists: Boolean(cart),
      cartOrderId: orderId,
      cartOrderCanceled: Boolean(cartOrder?.canceled),
      sessionAlive: Boolean(session),
      cartAmountMatches:
        Math.abs((sessionAmountToKurus(cart?.payment_collection?.amount) ?? -1000) - checkout.amount_kurus) <=
        AMOUNT_TOLERANCE_KURUS,
      itemsMatch: itemsSignature(cart?.items) === itemsSignature(checkout.items),
    })

    if (decision.action === "noop") return { outcome: "noop" }

    if (decision.action === "review") {
      await sendToReview(container, checkout, decision.kind, reviewDetail(decision.kind, checkout, orderId))
      return { outcome: "review", kind: decision.kind }
    }

    if (decision.action === "complete") {
      if (decision.adopt) {
        session = await adoptSession(container, cart as CartRow, checkout)
      }
      if (!session) throw new Error("Ödeme oturumu açılamadı.")
      await markPaytrSessionPaid(container, session.id)
      const { result } = await completeCartWorkflow(container).run({
        input: { id: checkout.cart_id },
      })
      orderId = (result as { id: string }).id
    }

    if (!orderId) throw new Error("Sipariş bulunamadı.")
    if (!session) throw new Error("Ödeme oturumu bulunamadı.")

    phase = "capture"
    await update(container, checkout.id, { order_id: orderId })
    await captureIfNeeded(container, session.id, checkout.amount_kurus / 100)

    const fresh = await resolvePaymentModule(container).retrievePaymentSession(session.id)
    await markCallbackProcessed(container, fresh, { paytr_status: "success" })
    await update(container, checkout.id, {
      status: "completed",
      session_id: session.id,
      last_error: null,
    })
    logger.info(
      `[paytr-checkout] Sipariş oluştu — order=${orderId} merchant_oid=${checkout.merchant_oid} kaynak=${input.source}`
    )
    await recordOpsEvent(container, {
      kind: "payment.succeeded",
      level: input.source === "status_query" ? "warning" : "info",
      title: `PayTR ödemesi alındı — ${(paidKurus / 100).toFixed(2)} TL`,
      detail:
        input.source === "status_query"
          ? "PayTR bildirimi gelmedi; ödeme durum sorgusuyla yakalandı. Bildirim adresini kontrol edin."
          : null,
      orderId,
      data: { merchant_oid: checkout.merchant_oid, amount: paidKurus / 100, source: input.source },
    })
    return { outcome: "completed", orderId }
  } catch (err) {
    const message = describeError(err)
    await update(container, checkout.id, {
      last_error: message.slice(0, 1000),
      retry_count: (checkout.retry_count || 0) + 1,
      ...(orderId ? { order_id: orderId } : {}),
    })
    await alertOnce(container, checkout, {
      kind: phase === "order" ? "order_create_failed" : "process_failed",
      orderId,
      detail:
        `${message} — Para alındı. Sistem otomatik tekrar deniyor; stok eksikse tamamlayın ya da PayTR panelinden iade edin (iade görülünce deneme durur). ` +
        // Mesafeli Sözleşmeler Yönetmeliği; taahhüt: storefront Teslimat ve Kargo sayfası
        "Stok yoksa müşteriye 3 gün içinde haber verin; onay vermezse ödemeyi bildirimden itibaren 14 gün içinde iade edin. " +
        `Müşteri: ${checkout.email || "?"}.`,
    })
    return { outcome: "retry", error: message }
  }
}

function reviewDetail(
  kind: PaytrReviewKind,
  checkout: PaytrCheckoutRecord,
  orderId: string | null
): string {
  const who = `Müşteri: ${checkout.email || "?"}, ${(((checkout.paid_kurus ?? 0)) / 100).toFixed(2)} TL.`
  switch (kind) {
    case "duplicate_payment":
      return `Bu sepet başka bir ödemeyle zaten siparişe dönüştü (${orderId}). Müşteri iki kez ödemiş; bu ödemeyi PayTR panelinden iade edin. ${who}`
    case "cart_changed":
      return `Müşteri ödeme ekranı açıkken sepeti değiştirmiş; sipariş otomatik açılmadı. Ödenen ürünler kayıtta. Siparişi elle açın ya da PayTR panelinden iade edin. ${who}`
    case "amount_mismatch":
      return `Ödenen tutar denemeyle tutmuyor (beklenen ${(checkout.amount_kurus / 100).toFixed(2)} TL); sipariş açılmadı. PayTR panelinden kontrol edin. ${who}`
    case "currency_mismatch":
      return `Ödemenin para birimi denemeyle tutmuyor (beklenen ${checkout.currency_code.toUpperCase()}); sipariş açılmadı. PayTR panelinden kontrol edin. ${who}`
    case "order_canceled":
      return `Bu sepetten açılan sipariş (${orderId}) iptal edilmiş; para alınmış ama tahsilat yazılmadı. Siparişi yeniden açın ya da PayTR panelinden iade edin. ${who}`
  }
}

async function sendToReview(
  container: MedusaContainer,
  checkout: PaytrCheckoutRecord,
  kind: PaytrReviewKind | "order_create_failed",
  detail: string
): Promise<void> {
  await update(container, checkout.id, {
    status: "review",
    review_kind: kind,
    last_error: detail.slice(0, 1000),
  })
  await alertOnce(container, checkout, { kind, orderId: checkout.order_id ?? null, detail }, true)
}

async function alertOnce(
  container: MedusaContainer,
  checkout: PaytrCheckoutRecord,
  alert: {
    kind: PaytrReviewKind | "order_create_failed" | "process_failed"
    orderId?: string | null
    detail: string
  },
  force = false
): Promise<void> {
  if (checkout.alerted_at && !force) return
  await sendPaytrCriticalAlert(container, {
    kind: alert.kind,
    merchantOid: checkout.merchant_oid,
    orderId: alert.orderId,
    sessionId: checkout.session_id,
    callbackAmountKurus: checkout.paid_kurus != null ? String(checkout.paid_kurus) : null,
    sessionAmount: (checkout.amount_kurus / 100).toFixed(2),
    detail: alert.detail,
  })
  const at = new Date()
  await update(container, checkout.id, { alerted_at: at })
  checkout.alerted_at = at
}

/**
 * Sepet değişmeden oturum silinmişse (müşteri yeni ödeme ekranı açtı, eskisinden ödedi)
 * parayı alan numarayla yeni oturum açılır. PayTR'ye istek gitmez.
 */
async function adoptSession(
  container: MedusaContainer,
  cart: CartRow,
  checkout: PaytrCheckoutRecord
) {
  const collectionId = cart.payment_collection?.id
  if (!collectionId) throw new Error("Sepetin ödeme kaydı yok.")
  await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: collectionId,
      provider_id: PAYTR_PROVIDER_ID,
      data: {
        adopt_merchant_oid: checkout.merchant_oid,
        adopt_token: computeAdoptToken(checkout.merchant_oid),
      },
    },
  })
  const reloaded = await loadCart(container, checkout.cart_id)
  return findCartSession(reloaded, checkout.merchant_oid)
}

async function captureIfNeeded(
  container: MedusaContainer,
  sessionId: string,
  amount: number
): Promise<void> {
  const { data } = await queryGraph(container).graph({
    entity: "payment",
    fields: ["id", "captured_at"],
    filters: { payment_session_id: sessionId },
  })
  const payment = (data as { id: string; captured_at?: unknown }[])?.[0]
  if (payment?.captured_at) return
  await processPaymentWorkflow(container).run({
    input: {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: sessionId, amount },
    },
  })
}

function canQueryPaytr(): boolean {
  return (
    !isPaytrMockEnabled() &&
    Boolean(
      process.env.PAYTR_MERCHANT_ID?.trim() &&
        process.env.PAYTR_MERCHANT_KEY?.trim() &&
        process.env.PAYTR_MERCHANT_SALT?.trim()
    )
  )
}

export type ReconcileSummary = {
  retried: number
  caught: number
  refunded: number
  to_review: number
  expired: number
}

/**
 * Bildirimi kaçan ve sonuçlanmamış ödemeleri toplar:
 *  - paid: sipariş / tahsilat tekrar denenir; PayTR'de iade edildiyse deneme durur
 *  - pending: PayTR'ye sorulur, ödenmişse sonuçlandırılır
 *  - süresi dolan pending: expired (geç callback gelirse yine işlenir)
 */
export async function reconcilePaytrCheckouts(
  container: MedusaContainer,
  deps: {
    query?: (oid: string) => Promise<PaytrStatusResult>
    now?: Date
  } = {}
): Promise<ReconcileSummary> {
  const query = deps.query ?? queryPaytrStatus
  const canQuery = Boolean(deps.query) || canQueryPaytr()
  const now = deps.now ?? new Date()
  const summary: ReconcileSummary = { retried: 0, caught: 0, refunded: 0, to_review: 0, expired: 0 }
  const logger = container.resolve("logger") as { error: (m: string) => void }
  const locking = resolveLocking(container)
  const withOidLock = <T>(oid: string, job: () => Promise<T>) =>
    locking.execute(paytrCallbackLockKey(oid), job, { timeout: 30, ttl: 180 })

  /** PayTR panelinden iade edilmiş ödeme: deneme kapanır, sipariş açılmaz. */
  const markRefunded = async (row: PaytrCheckoutRecord, returnedTotal: number) => {
    await update(container, row.id, { status: "refunded", last_error: null })
    summary.refunded++
    await recordOpsEvent(container, {
      kind: "payment.alert",
      level: "warning",
      title: `PayTR ödemesi sipariş oluşmadan iade edilmiş — ${returnedTotal.toFixed(2)} TL`,
      detail: "Deneme kapatıldı, sipariş açılmayacak.",
      data: { merchant_oid: row.merchant_oid },
    })
  }

  const svc = service(container)

  const paid = (await svc.listPaytrCheckouts(
    { status: "paid" },
    { take: 50, order: { paid_at: "ASC" } }
  )) as unknown as PaytrCheckoutRecord[]

  for (const row of paid) {
    try {
      // Sipariş açılmışsa yalnız tahsilat eksiktir; iade kontrolü sipariş açılmadan önce anlamlı.
      if (canQuery && !row.order_id) {
        const status = await query(row.merchant_oid)
        if (status.ok && status.returned_total > 0) {
          await markRefunded(row, status.returned_total)
          continue
        }
      }
      summary.retried++
      const result = await withOidLock(row.merchant_oid, () =>
        settlePaytrCheckout(container, row, {
          paidKurus: row.paid_kurus ?? row.amount_kurus,
          source: (row.paid_source as "callback" | "status_query" | "session") || "callback",
        })
      )
      const paidAt = row.paid_at ? new Date(row.paid_at).getTime() : now.getTime()
      if (result.outcome === "retry" && now.getTime() - paidAt > PAID_RETRY_MAX_AGE_MS) {
        summary.to_review++
        await sendToReview(
          container,
          row,
          "order_create_failed",
          `Para alındı, 3 gündür sipariş oluşturulamadı: ${result.error}. Otomatik deneme durdu; siparişi elle açın ya da PayTR panelinden iade edin. Müşteri: ${row.email || "?"}.`
        )
      }
    } catch (err) {
      logger.error(`[paytr-checkout] paid retry oid=${row.merchant_oid}: ${describeError(err)}`)
    }
  }

  const pending = (await svc.listPaytrCheckouts(
    { status: "pending" },
    { take: 200, order: { created_at: "DESC" } }
  )) as unknown as PaytrCheckoutRecord[]

  for (const row of pending) {
    const createdAt = new Date(row.created_at)
    if (now.getTime() - createdAt.getTime() > POLL_MAX_AGE_MS) {
      // Aynı anda gelen geç callback satırı paid/completed yapmış olabilir: kilit altında
      // taze okunur, yalnız hâlâ pending ise süresi dolar.
      await withOidLock(row.merchant_oid, async () => {
        const fresh = await findPaytrCheckout(container, row.merchant_oid)
        if (fresh?.status !== "pending") return
        await update(container, row.id, { status: "expired" })
        summary.expired++
      })
      continue
    }
    if (!canQuery) continue
    const lastPolled = row.last_polled_at ? new Date(row.last_polled_at) : null
    if (!isPollDue(createdAt, lastPolled, now)) continue
    try {
      const status = await query(row.merchant_oid)
      await update(container, row.id, { last_polled_at: now })
      if (!status.ok || !(status.payment_amount > 0)) continue
      // Panelden iade edilmiş ödeme "ödendi" görünür; sipariş açılmaz.
      if (status.returned_total > 0) {
        await withOidLock(row.merchant_oid, async () => {
          const fresh = await findPaytrCheckout(container, row.merchant_oid)
          if (fresh?.status === "pending" || fresh?.status === "expired") {
            await markRefunded(row, status.returned_total)
          }
        })
        continue
      }
      const result = await withOidLock(row.merchant_oid, () =>
        settlePaytrCheckout(container, row, {
          paidKurus: Math.round(status.payment_amount * 100),
          paidCurrency: status.currency,
          source: "status_query",
        })
      )
      if (result.outcome !== "noop") summary.caught++
    } catch (err) {
      logger.error(`[paytr-checkout] poll oid=${row.merchant_oid}: ${describeError(err)}`)
    }
  }

  return summary
}

export class PaytrCheckoutError extends Error {
  constructor(
    public code: "not_found" | "not_allowed" | "stale_token",
    message: string
  ) {
    super(message)
    this.name = "PaytrCheckoutError"
  }
}
