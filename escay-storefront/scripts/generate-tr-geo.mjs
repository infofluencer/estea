/**
 * Mahalle listesini üretir.
 *
 *   node scripts/generate-tr-geo.mjs
 *
 * Kaynak: NVİ adres kayıt sistemi (adres.nvi.gov.tr) dökümü —
 * github.com/melihozkara/il-ilce-mahalle-sokak-veritabani, 06.10.2026 verisi
 * (NVI_SHA ile sabit). Güncellemek için NVI_SHA'yı yeni commit'e çevirip çalıştırın.
 *
 * İlçe adları ../shared/tr-districts (kargo ilçe listesiyle doğrulanmış 973 ilçe)
 * listesinden gelir; NVİ'nin BÜYÜK HARF adları bu listeye eşlenir.
 *
 * Çıktı: public/tr-mahalle/<il>.json — { ilçe: [mahalle, ...] }
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const NVI_SHA = "316dbeedf32cae72006114ec1ec5a24a5d546ef1"
const NVI_RAW = `https://raw.githubusercontent.com/melihozkara/il-ilce-mahalle-sokak-veritabani/${NVI_SHA}/data`

const require = createRequire(import.meta.url)
const { TR_DISTRICTS } = require("../../shared/tr-districts.js")

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

/** Eşleştirme anahtarı: "KARAİSALI" ≡ "Karaisalı", "19 MAYIS" ≡ "19 Mayıs". */
const fold = (s) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")

/** "AKDURAK KÖYÜ,  ÇAKMAK MEZRASI" → "Akdurak Köyü, Çakmak Mezrası" */
const titleCase = (s) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s(\-/.])(\p{L})/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase("tr-TR"))

async function jsonl(plate, name) {
  const res = await fetch(`${NVI_RAW}/il-${plate}/${name}`)
  if (!res.ok) throw new Error(`NVİ il-${plate}/${name}: HTTP ${res.status}`)
  return (await res.text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const collator = new Intl.Collator("tr")
const outDir = join(root, "public/tr-mahalle")
mkdirSync(outDir, { recursive: true })

let total = 0
const problems = []

for (const code of Object.keys(TR_DISTRICTS).sort()) {
  const plate = Number(code)
  const ilceler = await jsonl(plate, "ilceler.jsonl")
  const mahalleler = await jsonl(plate, "mahalleler.jsonl")
  const districtName = new Map(ilceler.map((i) => [i.kimlikNo, fold(i.adi)]))

  const byDistrict = new Map()
  for (const m of mahalleler) {
    const key = districtName.get(m.ilce_id)
    if (!byDistrict.has(key)) byDistrict.set(key, new Set())
    byDistrict.get(key).add(titleCase(m.bilesenAdi))
  }

  const out = {}
  for (const district of TR_DISTRICTS[code]) {
    const list = byDistrict.get(fold(district))
    byDistrict.delete(fold(district))
    if (!list) problems.push(`${code} ${district}: NVİ'de yok`)
    out[district] = [...(list ?? [])].sort(collator.compare)
    total += out[district].length
  }
  for (const [leftover] of byDistrict) problems.push(`${code} NVİ ilçesi eşlenemedi: ${leftover}`)

  writeFileSync(join(outDir, `${code}.json`), JSON.stringify(out))
}

console.log(`[tr-geo] ${Object.keys(TR_DISTRICTS).length} il, ${total} mahalle/köy`)
if (problems.length) {
  console.error(problems.join("\n"))
  process.exit(1)
}
