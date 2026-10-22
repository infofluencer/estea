import { createReturnReasonsWorkflow } from "@medusajs/medusa/core-flows"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function ensureTestReturnReason(
  container: MedusaContainer,
  value = "changed_mind"
): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: existing } = await query.graph({
    entity: "return_reason",
    fields: ["id", "value"],
    filters: { value },
  })
  const found = existing?.[0] as { id?: string } | undefined
  if (found?.id) return found.id

  await createReturnReasonsWorkflow(container).run({
    input: {
      data: [
        {
          value,
          label: "Beğenmedim / vazgeçtim",
          description: "integration",
        },
      ],
    },
  })
  const { data: created } = await query.graph({
    entity: "return_reason",
    fields: ["id", "value"],
    filters: { value },
  })
  const id = (created?.[0] as { id?: string } | undefined)?.id
  if (!id) throw new Error("return reason create failed")
  return id
}
