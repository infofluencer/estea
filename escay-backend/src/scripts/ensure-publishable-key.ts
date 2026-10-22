import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"

export default async function ensurePublishableKey({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const apiKey = container.resolve(Modules.API_KEY)

  const storeModule = container.resolve(Modules.STORE)
  const [store] = await storeModule.listStores({})
  const storeDefaultChannelId = store?.default_sales_channel_id as
    | string
    | undefined

  const { data: channels } = await query.graph({
    entity: "sales_channel",
    fields: ["id", "name"],
  })
  // Prefer store default / "Es Çay" name; keep Medusa default EN name as fallback
  const defaultChannel =
    (channels || []).find((c: { id?: string }) => c.id === storeDefaultChannelId) ||
    (channels || []).find((c: { name?: string }) => c.name === "Es Çay") ||
    (channels || []).find(
      (c: { name?: string }) => c.name === "Default Sales Channel"
    ) ||
    channels?.[0]
  if (!defaultChannel?.id) {
    throw new Error("No sales channel found")
  }

  let token: string | undefined
  let keyId: string | undefined

  const existing = await apiKey.listApiKeys({ type: "publishable" })
  if (existing[0]?.token) {
    token = existing[0].token as string
    keyId = existing[0].id
    logger.info("Using existing publishable API key")
  } else {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: "Storefront",
            type: "publishable",
            created_by: "",
          },
        ],
      },
    })
    token = result[0].token
    keyId = result[0].id
    logger.info("Created publishable API key")
  }

  if (keyId) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: keyId,
        add: [defaultChannel.id],
      },
    })
  }

  if (!token) {
    throw new Error("Could not read publishable token; create one in Admin → Settings")
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name"],
    filters: { name: "Türkiye" },
  })
  const regionId = regions[0]?.id as string | undefined
  if (!regionId) {
    throw new Error('No "Türkiye" region — run seed-escay.ts first')
  }

  logger.info("--- Storefront env (Dokploy) ---")
  logger.info("MEDUSA_BACKEND_URL=http://<dokploy-backend-servis-adı>:9000")
  logger.info(`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${token}`)
  logger.info(`NEXT_PUBLIC_MEDUSA_REGION_ID=${regionId}`)
  logger.info("NEXT_PUBLIC_S3_FILE_URL=<S3_FILE_URL>")
  logger.info("(Türkiye — TRY, country_code=tr; Europe region kullanmayın)")

  const envDir = join(process.cwd(), "..", "escay-storefront")
  const envPath = join(envDir, ".env.local")
  if (existsSync(envDir)) {
    if (!existsSync(envPath)) {
      mkdirSync(envDir, { recursive: true })
    }
    writeFileSync(
      envPath,
      [
        "NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000",
        `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${token}`,
        `NEXT_PUBLIC_MEDUSA_REGION_ID=${regionId}`,
        "",
      ].join("\n"),
      "utf8"
    )
    logger.info("Wrote escay-storefront/.env.local (restart storefront dev)")
  }
}
