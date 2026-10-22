export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const url = process.env.MEDUSA_BACKEND_URL
  const pub = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  const region = process.env.NEXT_PUBLIC_MEDUSA_REGION_ID

  console.log(
    `[escay-storefront] MEDUSA_BACKEND_URL=${url ?? "(missing)"} pk=${pub ? "set" : "missing"} region=${region ?? "missing"}`
  )

  if (process.env.NODE_ENV === "production" && !url && !process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
    console.error(
      "[escay-storefront] No backend URL in env — API calls will fail. Set MEDUSA_BACKEND_URL in Dokploy Environment + Build-time Arguments."
    )
  }
}
