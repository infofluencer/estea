import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = fileURLToPath(new URL("./src/", import.meta.url))
const shared = fileURLToPath(new URL("../../shared/", import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${src}$1` },
      { find: /^@escay\/shared\/(.*)$/, replacement: `${shared}$1` },
    ],
  },
  // Next'in postcss.config.mjs'i (Tailwind v4) Vite formatında değil; testlerde CSS yok.
  css: { postcss: {} },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
})
