import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

/** İşlem kaydı için admin kullanıcının adı / e-postası */
export async function adminActorName(req: AuthenticatedMedusaRequest): Promise<string | null> {
  const id = req.auth_context?.actor_id
  if (!id) return null
  try {
    const user = await req.scope.resolve(Modules.USER).retrieveUser(id)
    return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || id
  } catch {
    return id
  }
}
