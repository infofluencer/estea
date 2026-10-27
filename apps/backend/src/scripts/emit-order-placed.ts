/**
 * Emit order.placed to exercise the subscriber (same path as checkout).
 *
 * Usage: medusa exec ./src/scripts/emit-order-placed.ts -- order_01M06D68DTBSAYT2A2K2AFRQQK
 */
import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function emitOrderPlaced({ container, args }: ExecArgs) {
  const orderId = args?.[0]
  if (!orderId) throw new Error("Kullanım: medusa exec ./src/scripts/emit-order-placed.ts <order_id>")
  const eventBus = container.resolve(Modules.EVENT_BUS)

  await eventBus.emit({
    name: "order.placed",
    data: { id: orderId },
  })
}
