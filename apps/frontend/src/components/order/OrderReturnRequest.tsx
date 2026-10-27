"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import formStyles from "@/components/auth/auth-form.module.css"
import { COMPANY } from "@/lib/company"
import {
  createReturnRequestAction,
  listExchangeOptionsAction,
  listReturnReasonsAction,
  type ExchangeOptionItem,
} from "@/lib/return-actions"
import type {
  OrderDetailView,
  OrderReturnContext,
  ReturnReason,
  ReturnRequestResult,
} from "./order-types"
import { getReturnableQuantity, rejectedReturnItemIds } from "./order-types"
import styles from "./order-detail.module.css"

type QtyMap = Record<string, number>

export function OrderReturnRequest({
  order,
  returnContext,
}: {
  order: OrderDetailView
  returnContext: OrderReturnContext
}) {
  const rejectedIds = useMemo(() => rejectedReturnItemIds(order.returns), [order.returns])
  const returnableItems = useMemo(() => {
    return (order.items || [])
      .filter((item) => item.id && !rejectedIds.has(item.id))
      .filter((item) => item.id && getReturnableQuantity(item.detail) > 0)
      .map((item) => ({
        id: item.id as string,
        title: item.title || "Ürün",
        color: item.variant?.title,
        max: getReturnableQuantity(item.detail),
      }))
  }, [order.items, rejectedIds])

  const [open, setOpen] = useState(false)
  // "return": para iadesi · "exchange": aynı ürün başka gramaj/çeşit (para iadesi yok)
  const [kind, setKind] = useState<"return" | "exchange">("return")
  const [options, setOptions] = useState<ExchangeOptionItem[] | null>(null)
  const [variantById, setVariantById] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<ReturnReason[]>([])
  const [qty, setQty] = useState<QtyMap>({})
  const [reasonId, setReasonId] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ReturnRequestResult | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || reasons.length) return
    startTransition(async () => {
      const list = await listReturnReasonsAction()
      setReasons(list)
      if (list[0]?.id) setReasonId(list[0].id)
    })
  }, [open, reasons.length])

  useEffect(() => {
    if (kind !== "exchange" || options !== null) return
    startTransition(async () => {
      setOptions(
        await listExchangeOptionsAction({
          order_id: order.id,
          email: returnContext.mode === "guest" ? returnContext.email : undefined,
        })
      )
    })
  }, [kind, options, order.id, returnContext])

  // Değişimde sebep "Yanlış gramaj / çeşit" (varsa) ile başlar
  useEffect(() => {
    if (kind !== "exchange") return
    const wrongVariant =
      reasons.find((r) => r.value === "wrong_variant") ||
      reasons.find((r) => r.value === "wrong_size_color") // eski seed
    if (wrongVariant) setReasonId(wrongVariant.id)
  }, [kind, reasons])

  if (created) {
    const exchange = kind === "exchange"
    return (
      <section
        className={styles.section}
        aria-labelledby="return-done"
        data-testid="return-request-success"
      >
        <h2 id="return-done" className={styles.sectionTitle}>
          {exchange ? "Değişim talebi alındı" : "İade talebi alındı"}
        </h2>
        <p className={styles.returnLead}>
          Talebiniz oluşturuldu. <strong>İade kodunuz en geç 1 iş günü içinde e-postayla iletilecek</strong>;
          lütfen kod gelmeden ürünü kargoya vermeyin.
          {exchange ? " Ürün bize ulaşıp kontrol edildikten sonra seçtiğiniz gramaj/çeşit ücretsiz kargoyla gönderilir." : ""}
        </p>
        <ol className={styles.returnSteps}>
          <li>Ürünü açılmamış, orijinal ambalajında ve hasarsız şekilde paketleyin.</li>
          <li>
            İade kodunuz e-postayla gelince paketi e-postada belirtilen kargo firmasının şubesine
            götürün; şubede iade kodunuzu söylemeniz yeterli.
          </li>
          <li>
            Sorunuz olursa {COMPANY.emailOps} adresine yazabilirsiniz.
          </li>
          <li>
            {exchange
              ? "Ürün tarafımıza ulaşınca incelenir ve yeni ürününüz kargoya verilir; kargo bilgisi e-postayla gelir."
              : "Ürün tarafımıza ulaşınca iade incelenir ve para iadesi yapılır."}
          </li>
        </ol>
      </section>
    )
  }

  if (returnableItems.length === 0) {
    return (
      <section
        className={styles.section}
        aria-labelledby="return-heading"
        data-testid="return-request-unavailable"
      >
        <h2 id="return-heading" className={styles.sectionTitle}>
          İade / Değişim
        </h2>
        <p className={styles.returnLead}>
          {rejectedIds.size > 0
            ? "Bu siparişteki iade talebiniz değerlendirildi. Sorunuz varsa lütfen bizimle iletişime geçin."
            : "Bu siparişte iade edilebilir ürün yok. İade, ürün kargoya verildikten sonra açılabilir."}
        </p>
      </section>
    )
  }

  function toggleOpen() {
    setError(null)
    setOpen((v) => !v)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const items = returnableItems
      .map((item) => ({
        id: item.id,
        quantity: Math.min(Math.max(0, qty[item.id] || 0), item.max),
        ...(kind === "exchange" && variantById[item.id]
          ? { exchange_variant_id: variantById[item.id] }
          : {}),
      }))
      .filter((i) => i.quantity > 0)

    if (!items.length) {
      setError("En az bir ürün için adet seçin.")
      return
    }
    if (kind === "exchange" && items.some((i) => !i.exchange_variant_id)) {
      setError("Değişim için her ürünün yeni gramaj/çeşidini seçin.")
      return
    }
    if (!reasonId) {
      setError("İade sebebi seçin.")
      return
    }

    startTransition(async () => {
      const result = await createReturnRequestAction({
        order_id: order.id,
        items,
        reason_id: reasonId,
        note: note.trim() || undefined,
        email:
          returnContext.mode === "guest" ? returnContext.email : undefined,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setCreated(result.return)
    })
  }

  return (
    <section
      className={styles.section}
      aria-labelledby="return-heading"
      data-testid="return-request"
    >
      <h2 id="return-heading" className={styles.sectionTitle}>
        İade / Değişim
      </h2>
      {!open ? (
        <div className={styles.returnActions}>
          <button
            type="button"
            className="cart-cta cart-cta--primary"
            data-testid="return-request-open"
            onClick={() => {
              setKind("return")
              toggleOpen()
            }}
          >
            İade talebi oluştur
          </button>
          <button
            type="button"
            className="cart-cta cart-cta--primary"
            data-testid="exchange-request-open"
            onClick={() => {
              setKind("exchange")
              toggleOpen()
            }}
          >
            Gramaj / çeşit değişimi
          </button>
        </div>
      ) : (
        <form
          className={formStyles.form}
          onSubmit={onSubmit}
          noValidate
          data-testid="return-request-form"
        >
          <p className={styles.returnLead}>
            {kind === "exchange"
              ? "Değiştirmek istediğiniz ürünleri, adetleri ve yeni gramaj/çeşidi seçin. Ürün bize açılmamış ulaşıp kontrol edilince yeni ürün ücretsiz kargoyla gönderilir; para iadesi yapılmaz."
              : "İade etmek istediğiniz ürünleri ve adetleri seçin. Kargoyu siz göndereceksiniz; takip numarasını not alanına yazabilirsiniz."}
          </p>

          <div className={styles.returnItems}>
            {returnableItems.map((item) => {
              const opt = options?.find((o) => o.item_id === item.id)
              return (
              <div key={item.id} className={formStyles.field}>
                <label className={formStyles.label} htmlFor={`ret-qty-${item.id}`}>
                  {item.title}
                  {item.color ? ` — ${item.color}` : ""}{" "}
                  <span className={styles.returnMax}>(max {item.max})</span>
                </label>
                <input
                  id={`ret-qty-${item.id}`}
                  data-testid={`return-qty-${item.id}`}
                  className={formStyles.input}
                  type="number"
                  min={0}
                  max={item.max}
                  step={1}
                  value={qty[item.id] ?? 0}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setQty((prev) => ({
                      ...prev,
                      [item.id]: Number.isFinite(n)
                        ? Math.min(Math.max(0, Math.floor(n)), item.max)
                        : 0,
                    }))
                  }}
                />
                {kind === "exchange" ? (
                  options === null ? (
                    <span className={styles.returnMax}>Seçenekler yükleniyor…</span>
                  ) : !opt || !opt.choices.length ? (
                    <span className={styles.returnMax}>Bu ürün için başka gramaj/çeşit yok.</span>
                  ) : (
                    <select
                      aria-label="Yeni gramaj / çeşit"
                      data-testid={`exchange-variant-${item.id}`}
                      className={formStyles.input}
                      value={variantById[item.id] || ""}
                      onChange={(e) =>
                        setVariantById((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    >
                      <option value="">Yeni gramaj / çeşit seçin</option>
                      {opt.choices.map((c) => (
                        <option key={c.variant_id} value={c.variant_id} disabled={!c.in_stock}>
                          {c.title}
                          {c.in_stock ? "" : " (stokta yok)"}
                        </option>
                      ))}
                    </select>
                  )
                ) : null}
              </div>
              )
            })}
          </div>

          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="return-reason">
              İade sebebi
            </label>
            <select
              id="return-reason"
              data-testid="return-reason"
              className={formStyles.input}
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
              required
            >
              {!reasons.length ? (
                <option value="">Yükleniyor…</option>
              ) : (
                reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label || r.value || r.id}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="return-note">
              Not (opsiyonel)
            </label>
            <textarea
              id="return-note"
              data-testid="return-note"
              className={formStyles.input}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Örn. iade sebebiyle ilgili açıklama"
            />
          </div>

          {error ? <p className={formStyles.error}>{error}</p> : null}

          <div className={styles.returnActions}>
            <button
              type="submit"
              className="cart-cta cart-cta--primary"
              data-testid="return-request-submit"
              disabled={pending}
            >
              {pending ? "Gönderiliyor…" : "Talebi gönder"}
            </button>
            <button
              type="button"
              className={styles.returnCancel}
              onClick={toggleOpen}
              disabled={pending}
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
