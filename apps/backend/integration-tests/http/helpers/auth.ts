/**
 * Admin + doğrulanmış müşteri oturumları (integration HTTP testleri).
 */
import jwt from "jsonwebtoken"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { StorefrontFixture } from "./storefront-fixture"

type ApiClient = {
  post: Function
  get: Function
}

export type AuthHeaders = { headers: Record<string, string> }

/** Durum kodu ne olursa olsun yanıtı döndür (axios fırlatmasın). */
export const noThrow = { validateStatus: () => true }

/**
 * Admin kullanıcı + auth identity oluşturur, Medusa'nın kendi jwtSecret'iyle
 * imzalı Bearer token döner. Parola akışına girmez — admin login testi değil.
 */
export async function createAdminHeaders(
  container: MedusaContainer
): Promise<AuthHeaders> {
  const userModule = container.resolve(Modules.USER)
  const authModule = container.resolve(Modules.AUTH)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as {
    projectConfig: { http: { jwtSecret?: string } }
  }

  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@escay.test`
  const user = await userModule.createUsers({ email })
  const authIdentity = await authModule.createAuthIdentities({
    provider_identities: [{ provider: "emailpass", entity_id: email }],
    app_metadata: { user_id: user.id },
  })

  const token = jwt.sign(
    {
      actor_id: user.id,
      actor_type: "user",
      auth_identity_id: authIdentity.id,
      app_metadata: { user_id: user.id },
    },
    config.projectConfig.http.jwtSecret || "supersecret",
    { expiresIn: "1d" }
  )
  return { headers: { Authorization: `Bearer ${token}` } }
}

export type VerifiedCustomer = {
  customerId: string
  email: string
  token: string
  /** publishable key + Bearer */
  headers: AuthHeaders
}

/**
 * Storefront kayıt akışı: register → /store/customers → e-posta onayı → login.
 * Actor token yalnız onaydan sonra verilir (authVerificationsPerActor).
 */
export async function registerVerifiedCustomer(
  api: ApiClient,
  container: MedusaContainer,
  fx: StorefrontFixture,
  email: string,
  password = "IntegrationAuth2026!a"
): Promise<VerifiedCustomer> {
  const register = await api.post(`/auth/customer/emailpass/register`, {
    email,
    password,
  })
  const actorless = register.data.token as string
  const customer = await api.post(
    `/store/customers`,
    { email, first_name: "Test", last_name: "Müşteri" },
    {
      headers: {
        ...fx.storeHeaders.headers,
        Authorization: `Bearer ${actorless}`,
      },
    }
  )
  const customerId = customer.data.customer.id as string

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "provider_identity",
    fields: ["auth_identity_id"],
    filters: { entity_id: email, provider: "emailpass" },
  })
  const authIdentityId = (data?.[0] as { auth_identity_id?: string } | undefined)
    ?.auth_identity_id
  if (!authIdentityId) throw new Error(`No emailpass identity for ${email}`)

  const auth = container.resolve(Modules.AUTH) as unknown as {
    requestAuthVerification: (data: {
      auth_identity_id: string
      entity_id: string
      entity_type: string
      code_provider: string
    }) => Promise<{ code?: string }>
  }
  const requested = await auth.requestAuthVerification({
    auth_identity_id: authIdentityId,
    entity_id: email,
    entity_type: "email",
    code_provider: "token",
  })
  if (!requested.code) throw new Error("requestAuthVerification did not return a code")

  await api.post(
    `/auth/verification/confirm`,
    { code: requested.code, code_provider: "token" },
    { headers: { Authorization: `Bearer ${actorless}` } }
  )

  const login = await api.post(`/auth/customer/emailpass`, { email, password })
  const token = login.data.token as string
  if (!token || login.data.verification_required) {
    throw new Error(`Login after verification failed for ${email}`)
  }
  return {
    customerId,
    email,
    token,
    headers: {
      headers: { ...fx.storeHeaders.headers, Authorization: `Bearer ${token}` },
    },
  }
}
