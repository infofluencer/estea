/**
 * Medusa build emits require("@escay/shared/...") but Node does not read tsconfig paths.
 * Link .medusa/server/shared into node_modules so production runtime can resolve the alias.
 * Medusa compile only emits .js — copy package.json so Node treats shared/ as @escay/shared.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs"
import { join } from "node:path"

const serverRoot = join(process.cwd(), ".medusa/server")
const sharedDir = join(serverRoot, "shared")
const sourcePkg = join(process.cwd(), "shared/package.json")
const targetPkg = join(sharedDir, "package.json")
const escayDir = join(serverRoot, "node_modules/@escay")
const linkPath = join(escayDir, "shared")

if (!existsSync(sharedDir)) {
  console.error(
    "[escay-backend] .medusa/server/shared missing — run medusa build first"
  )
  process.exit(1)
}

if (!existsSync(sourcePkg)) {
  console.error(
    "[escay-backend] shared/package.json missing — add @escay/shared package manifest"
  )
  process.exit(1)
}

copyFileSync(sourcePkg, targetPkg)

mkdirSync(escayDir, { recursive: true })
if (existsSync(linkPath)) {
  rmSync(linkPath, { recursive: true, force: true })
}

symlinkSync("../../shared", linkPath, "dir")
console.log("[escay-backend] linked @escay/shared -> .medusa/server/shared")
