import type { MetadataRoute } from "next"
import { isIndexableSite, siteUrl } from "@/lib/site"

export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableSite()) {
    return { rules: { userAgent: "*", disallow: "/" } }
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/sepet",
        "/odeme",
        "/hesabim",
        "/istek-listesi",
        "/order-tracking",
        "/verify-email",
        "/reset-password",
        "/forgot-password",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
