import { readFileSync } from "fs"
import { join } from "path"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * Deploy doğrulama — Docker CACHE_BUST kaçırıldıysa commit eski kalır.
 * GET /health/revision → { gitCommit, cacheBust, built, sourceRevision }
 */
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  let fileMeta: Record<string, string> = {}
  try {
    const raw = readFileSync(join(process.cwd(), ".build-meta"), "utf8")
    for (const line of raw.split("\n")) {
      const i = line.indexOf("=")
      if (i > 0) {
        fileMeta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
      }
    }
  } catch {
    fileMeta = {}
  }

  res.status(200).json({
    gitCommit:
      process.env.GIT_COMMIT || fileMeta.commit || fileMeta.GIT_COMMIT || null,
    cacheBust:
      process.env.CACHE_BUST || fileMeta.cache_bust || fileMeta.CACHE_BUST || null,
    built:
      process.env.BUILD_TIMESTAMP ||
      fileMeta.built ||
      fileMeta.BUILD_TIMESTAMP ||
      null,
    sourceRevision:
      process.env.SOURCE_REVISION || fileMeta.revision || null,
  })
}
