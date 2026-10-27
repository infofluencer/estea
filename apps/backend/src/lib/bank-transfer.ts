import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Havale / EFT — banka bilgileri ve sipariş yardımcıları.
 *
 * Env:
 *   BANK_TRANSFER_ENABLED       1 → checkout'ta seçenek görünür (varsayılan kapalı)
 *   BANK_TRANSFER_BANK_NAME     Banka adı (örn. "Ziraat Bankası")
 *   BANK_TRANSFER_ACCOUNT_NAME  Hesap sahibi (alıcı adı / unvan)
 *   BANK_TRANSFER_IBAN          TR ile başlayan IBAN (boşluklu/boşluksuz)
 *
 * IBAN veya hesap sahibi boşsa bayrak açık olsa bile seçenek gösterilmez.
 */

export const BANK_TRANSFER_PROVIDER_ID = "pp_havale_havale"

/** Cart → order metadata.payment_method değeri. */
export const BANK_TRANSFER_METHOD = "bank_transfer"

export type BankTransferInfo = {
  bank_name: string
  account_name: string
  /** Dört hanelik gruplar: "TR00 0000 …" */
  iban: string
}

export function formatIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1 ")
}

function isTruthy(value: string | undefined): boolean {
  const v = String(value ?? "").trim().toLowerCase()
  return v === "1" || v === "true"
}

/** Havale açık ve banka bilgileri tamsa bilgiler, değilse null. */
export function bankTransferInfo(
  env: Record<string, string | undefined> = process.env
): BankTransferInfo | null {
  if (!isTruthy(env.BANK_TRANSFER_ENABLED)) return null
  const iban = (env.BANK_TRANSFER_IBAN || "").replace(/\s+/g, "")
  const accountName = (env.BANK_TRANSFER_ACCOUNT_NAME || "").trim()
  if (!iban || !accountName) return null
  return {
    bank_name: (env.BANK_TRANSFER_BANK_NAME || "").trim(),
    account_name: accountName,
    iban: formatIban(iban),
  }
}

type OrderPaymentRow = {
  id?: string
  status?: string | null
  metadata?: Record<string, unknown> | null
  payment_collections?: { status?: string | null }[] | null
}

export function isBankTransferOrder(order: { metadata?: Record<string, unknown> | null }): boolean {
  return order.metadata?.payment_method === BANK_TRANSFER_METHOD
}

function isPaid(order: OrderPaymentRow): boolean {
  return (order.payment_collections || []).some((pc) => {
    const st = String(pc.status || "").toLowerCase()
    return st === "completed" || st === "authorized" || st === "captured"
  })
}

/**
 * Store sipariş yanıtı için: ödemesi beklenen havale siparişinde banka bilgisi.
 * metadata müşteriye açılmaz — yalnızca bu alan eklenir.
 *
 * Bayrak sonradan kapatılsa bile bekleyen siparişin müşterisi IBAN'ı görmeye
 * devam eder (yalnızca IBAN + hesap sahibi şart).
 */
export async function pendingBankTransferForOrder(
  container: MedusaContainer,
  orderId: string
): Promise<BankTransferInfo | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "status", "metadata", "payment_collections.status"],
    filters: { id: orderId },
  })
  const order = data?.[0] as OrderPaymentRow | undefined
  if (!order || !isBankTransferOrder(order)) return null
  if (order.status === "canceled" || isPaid(order)) return null
  return bankTransferInfo({ ...process.env, BANK_TRANSFER_ENABLED: "1" })
}
