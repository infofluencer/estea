import { readFileSync } from "node:fs"
import { join } from "node:path"

export const dynamic = "force-dynamic"

function readBuildMeta(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), ".build-meta"), "utf8")
    return Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf("=")
          if (idx === -1) return [line, ""]
          return [line.slice(0, idx), line.slice(idx + 1)]
        })
    )
  } catch {
    return {}
  }
}

export async function GET() {
  const meta = readBuildMeta()

  return Response.json({
    service: "escay-storefront",
    revision:
      process.env.SOURCE_REVISION ??
      meta.revision ??
      process.env.GIT_COMMIT ??
      "unknown",
    gitCommit: process.env.GIT_COMMIT ?? meta.commit ?? "unknown",
    cacheBust: process.env.CACHE_BUST ?? meta.cache_bust ?? "unknown",
    builtAt: process.env.BUILD_TIMESTAMP ?? meta.built ?? "unknown",
  })
}
