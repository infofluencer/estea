/**
 * Reset an existing admin user's emailpass password.
 *
 * `medusa user` only creates — it fails if the email already exists.
 *
 * Usage:
 *   medusa exec ./src/scripts/reset-admin-password.ts admin@market.esteacay.com 'new-password'
 */
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import scrypt from "scrypt-kdf"

type AuthService = {
  updateProviderIdentities: (
    data: Record<string, unknown> | Record<string, unknown>[]
  ) => Promise<unknown>
}

export default async function resetAdminPassword({
  container,
  args,
}: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const auth = container.resolve(Modules.AUTH) as AuthService

  const email = String(args?.[0] || "")
    .trim()
    .toLowerCase()
  const password = String(args?.[1] || "")

  if (!email || !password) {
    throw new Error(
      "Usage: medusa exec ./src/scripts/reset-admin-password.ts <email> <password>"
    )
  }

  const { data: users } = await query.graph({
    entity: "user",
    fields: ["id", "email"],
    filters: { email },
  })

  const user = users?.[0]
  if (!user?.id) {
    throw new Error(`Admin user not found: ${email}`)
  }

  const { data: identities } = await query.graph({
    entity: "provider_identity",
    fields: ["id", "entity_id", "provider", "provider_metadata"],
    filters: { entity_id: email, provider: "emailpass" },
  })

  const identity = identities?.[0]
  if (!identity?.id) {
    throw new Error(`emailpass identity not found for ${email}`)
  }

  const passwordHash = (
    await scrypt.kdf(password, { logN: 15, r: 8, p: 1 })
  ).toString("base64")

  await auth.updateProviderIdentities({
    id: identity.id,
    provider_metadata: {
      ...(identity.provider_metadata || {}),
      password: passwordHash,
    },
  })

  logger.info(`Password updated for admin user ${email} (${user.id})`)
}
