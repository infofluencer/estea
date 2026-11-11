import { readdirSync, readFileSync } from "fs"
import path from "path"
import { DASHBOARD_CLASS_ANCHORS } from "../theme-anchors"

/**
 * @medusajs/dashboard güncellenince beyaz temanın dayandığı sınıflar sessizce
 * kaybolabilir. Kurulu paketteki className metinlerinde her zincirin bütün
 * sınıflarının bir arada geçtiği en az bir öğe aranır.
 */
function dashboardClassNames(): string[][] {
  const dist = path.dirname(require.resolve("@medusajs/dashboard/package.json")) + "/dist"
  const lists: string[][] = []
  for (const file of readdirSync(dist)) {
    if (!/\.(m?js)$/.test(file)) continue
    const src = readFileSync(path.join(dist, file), "utf8")
    // "..." ve `...` içindeki sınıf listeleri (clx / className argümanları)
    for (const m of src.matchAll(/["`]([^"`\n]{3,600})["`]/g)) {
      if (!m[1].includes(" ") && !m[1].includes("-")) continue
      lists.push(m[1].split(/\s+/))
    }
  }
  return lists
}

describe("beyaz tema sınıf zincirleri", () => {
  const lists = dashboardClassNames()

  it("dashboard paketi okunabiliyor", () => {
    expect(lists.length).toBeGreaterThan(1000)
  })

  it.each(DASHBOARD_CLASS_ANCHORS.map((a) => [a.use, a.classes] as const))(
    "%s hâlâ dashboard'da geçiyor",
    (_use, classes) => {
      const found = lists.some((tokens) => classes.every((c) => tokens.includes(c)))
      expect(found).toBe(true)
    }
  )
})
