import { cpSync, existsSync } from "node:fs"

const source = "../shared"
const target = "./shared"

if (existsSync(source)) {
  cpSync(source, target, { recursive: true, force: true })
  console.log("[escay-backend] synced shared/ from monorepo root")
} else if (!existsSync(target)) {
  console.error(
    "[escay-backend] shared/ missing — Docker build should COPY shared ./shared"
  )
  process.exit(1)
}
