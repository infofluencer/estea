/**
 * medusa exec loads scripts via dynamic import — raw .ts fails in production.
 * Transpile each script to CommonJS .js for Docker runner.
 */
import { transformFileSync } from "@swc/core"
import { readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const scriptsDir = join(process.cwd(), "src", "scripts")

for (const file of readdirSync(scriptsDir)) {
  if (!file.endsWith(".ts")) continue
  const input = join(scriptsDir, file)
  const output = join(scriptsDir, file.replace(/\.ts$/, ".js"))
  const result = transformFileSync(input, {
    jsc: {
      parser: { syntax: "typescript", decorators: true },
      target: "es2021",
      keepClassNames: true,
    },
    module: { type: "commonjs" },
  })
  if (!result.code) {
    console.error(`[escay-backend] failed to compile ${file}`)
    process.exit(1)
  }
  writeFileSync(output, result.code, "utf8")
  console.log(`[escay-backend] compiled ${file} → ${file.replace(/\.ts$/, ".js")}`)
}
