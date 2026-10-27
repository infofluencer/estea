import { NextResponse } from "next/server"
import { backendUrl } from "@/lib/medusa"
import { SITE_HOST, isProductionHostname } from "@/lib/site"

export const dynamic = "force-dynamic"

/**
 * Staging config diagnostics — only when ALLOW_STAGING_DIAGNOSTICS=1.
 * Never exposes full secrets; only host + boolean flags.
 */
export async function GET() {
  if (process.env.ALLOW_STAGING_DIAGNOSTICS !== "1") {
    return NextResponse.json({ ok: false, error: "disabled" }, { status: 404 })
  }

  let backendHost = ""
  let backendLooksProd = false
  try {
    const u = new URL(backendUrl())
    backendHost = u.host
    const host = u.hostname.toLowerCase()
    backendLooksProd =
      isProductionHostname(host) || host === `api.${SITE_HOST}` || u.port === "3025"
  } catch {
    backendHost = ""
  }

  const pk = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
  const region = process.env.NEXT_PUBLIC_MEDUSA_REGION_ID || ""

  return NextResponse.json({
    ok: true,
    backendHost,
    backendLooksStaging: Boolean(backendHost) && !backendLooksProd,
    hasPublishableKey: Boolean(pk) && !pk.includes("replace_me"),
    publishableKeyPrefix: pk ? pk.slice(0, 6) : "",
    hasRegionId: Boolean(region) && !region.includes("replace_me"),
  })
}
