import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  cancelReturnReceiveWorkflow,
  cancelReturnWorkflow,
} from "@medusajs/medusa/core-flows"

/** metadata.escay_rejection — refund ASLA tetiklenmemeli */
export type EscayRejectionMeta = {
  rejected: true
  at: string
  reason?: string | null
  rejected_by?: string | null
}

export function isReturnRejected(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  if (!metadata || typeof metadata !== "object") return false
  const block = metadata.escay_rejection
  if (block && typeof block === "object") {
    return (block as { rejected?: unknown }).rejected === true
  }
  // legacy / shorthand
  return metadata.rejected === true
}

export type RejectReturnResult = {
  return_id: string
  order_id: string
  status: string | null
  canceled: boolean
  refund_blocked: boolean
  rejection: EscayRejectionMeta
}

async function markRejectedMetadata(
  scope: MedusaContainer,
  returnId: string,
  existingMeta: Record<string, unknown> | null | undefined,
  rejection: EscayRejectionMeta
) {
  const orderModule = scope.resolve(Modules.ORDER)
  await orderModule.updateReturns([
    {
      selector: { id: returnId },
      data: {
        metadata: {
          ...(existingMeta || {}),
          rejected: true,
          escay_rejection: rejection,
          // Block PayTR retry even if somehow received later
          paytr_refund: {
            status: "skipped",
            error: "Return rejected — refund blocked",
            at: rejection.at,
            note: "escay_rejection",
          },
        },
      },
    },
  ])
}

/**
 * Mağaza iade reddi: metadata önce yazılır (refund guard), sonra cancel.
 * Receive confirm edilmeden çağrılmalı — stok geri yazılmaz, refund yok.
 */
export async function rejectStoreReturn(
  scope: MedusaContainer,
  input: {
    return_id: string
    reason?: string | null
    rejected_by?: string | null
  }
): Promise<RejectReturnResult> {
  const logger = scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const returnId = input.return_id

  const { data: returns } = await query.graph({
    entity: "return",
    fields: [
      "id",
      "status",
      "order_id",
      "metadata",
      "canceled_at",
      "items.id",
      "items.received_quantity",
    ],
    filters: { id: returnId },
  })

  const ret = returns?.[0] as
    | {
        id: string
        status?: string | null
        order_id: string
        metadata?: Record<string, unknown> | null
        canceled_at?: string | Date | null
        items?: { id?: string; received_quantity?: number | null }[]
      }
    | undefined

  if (!ret?.id || !ret.order_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Return not found")
  }

  const existingRefund = ret.metadata?.paytr_refund as
    | { status?: string }
    | undefined
  if (existingRefund?.status === "success") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Para iadesi yapılmış iade reddedilemez."
    )
  }

  if (isReturnRejected(ret.metadata)) {
    return {
      return_id: ret.id,
      order_id: ret.order_id,
      status: ret.status ?? null,
      canceled: Boolean(ret.canceled_at) || ret.status === "canceled",
      refund_blocked: true,
      rejection: (ret.metadata?.escay_rejection || {
        rejected: true,
        at: new Date().toISOString(),
      }) as EscayRejectionMeta,
    }
  }

  const hasReceivedQty = (ret.items || []).some(
    (i) => Number(i.received_quantity || 0) > 0
  )
  const alreadyReceived =
    ret.status === "received" ||
    ret.status === "partially_received" ||
    hasReceivedQty

  const rejection: EscayRejectionMeta = {
    rejected: true,
    at: new Date().toISOString(),
    reason:
      typeof input.reason === "string" && input.reason.trim()
        ? input.reason.trim().slice(0, 500)
        : null,
    rejected_by: input.rejected_by || null,
  }

  // CRITICAL: write rejection flag BEFORE cancel / any receive race
  await markRejectedMetadata(scope, returnId, ret.metadata, rejection)
  logger.info(
    `[return-reject] Marked rejected — return=${returnId} order=${ret.order_id}`
  )

  let canceled = false

  if (!alreadyReceived && !ret.canceled_at) {
    try {
      await cancelReturnReceiveWorkflow(scope).run({
        input: { return_id: returnId },
      })
    } catch {
      // no active receive change — OK
    }

    try {
      await cancelReturnWorkflow(scope).run({
        input: {
          return_id: returnId,
          canceled_by: input.rejected_by || undefined,
        },
      })
      canceled = true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.warn(
        `[return-reject] cancelReturn failed — return=${returnId}: ${message}`
      )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `İade reddedildi (refund engellendi) ancak iptal edilemedi: ${message}`
      )
    }
  } else if (alreadyReceived) {
    logger.warn(
      `[return-reject] Return already has received qty — refund blocked only, ` +
        `status unchanged — return=${returnId}`
    )
  }

  try {
    const eventBus = scope.resolve(Modules.EVENT_BUS) as {
      emit: (event: {
        name: string
        data: Record<string, unknown>
      }) => Promise<unknown>
    }
    await eventBus.emit({
      name: "escay.return_rejected",
      data: {
        return_id: returnId,
        order_id: ret.order_id,
        reason: rejection.reason,
        rejected_by: rejection.rejected_by,
        canceled,
      },
    })
  } catch (emitErr) {
    logger.error(
      `[return-reject] Failed to emit escay.return_rejected — return=${returnId}: ${String(emitErr)}`
    )
  }

  const { data: after } = await query.graph({
    entity: "return",
    fields: ["id", "status", "canceled_at"],
    filters: { id: returnId },
  })
  const row = after?.[0] as
    | { status?: string | null; canceled_at?: string | Date | null }
    | undefined

  return {
    return_id: returnId,
    order_id: ret.order_id,
    status: row?.status ?? ret.status ?? null,
    canceled: canceled || Boolean(row?.canceled_at) || row?.status === "canceled",
    refund_blocked: true,
    rejection,
  }
}
