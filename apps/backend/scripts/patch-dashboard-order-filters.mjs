#!/usr/bin/env node
/**
 * @medusajs/dashboard yaması — sipariş listesi "Filtre Ekle"ye Ödeme durumu ve
 * Kargo durumu (Medusa v2'de yoruma alınmış). `npm run build` öncesi çalışır
 * (prebuild); tekrar çalıştırılırsa bir şey yapmaz.
 *
 * Sunucu tarafı: src/api/admin/orders/status-filter.ts (durum → id filtresi).
 * Medusa güncellenip kod değişirse build hata verir → yama elden geçirilmeli.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const DIST = join(process.cwd(), "node_modules", "@medusajs", "dashboard", "dist")
const MARKER = "/* order-status-filters */"

const PAYMENT = [
  ["captured", "captured"],
  ["awaiting", "awaiting"],
  ["requires_action", "requiresAction"],
  ["not_paid", "notPaid"],
  ["authorized", "authorized"],
  ["partially_refunded", "partiallyRefunded"],
  ["refunded", "refunded"],
  ["canceled", "canceled"],
]
const FULFILLMENT = [
  ["not_fulfilled", "notFulfilled"],
  ["fulfilled", "fulfilled"],
  ["shipped", "shipped"],
  ["delivered", "delivered"],
  ["partially_fulfilled", "partiallyFulfilled"],
  ["partially_shipped", "partiallyShipped"],
  ["canceled", "canceled"],
]

const options = (list, ns) =>
  `[${list.map(([value, key]) => `{ value: "${value}", label: t("orders.${ns}.status.${key}") }`).join(", ")}]`

const PATCHES = [
  {
    name: "useOrderTableQuery",
    anchor: 'var useOrderTableQuery = (',
    replacements: [
      ['      // "payment_status",\n      // "fulfillment_status",', '      "payment_status",\n      "fulfillment_status",'],
      ["    // fulfillment_status,\n    // payment_status,", "    fulfillment_status,\n    payment_status,"],
      [
        '    // fulfillment_status: fulfillment_status?.split(","),\n    // payment_status: payment_status?.split(","),',
        '    fulfillment_status: fulfillment_status?.split(","),\n    payment_status: payment_status?.split(","),',
      ],
    ],
  },
  {
    name: "useOrderTableFilters",
    anchor: "var useOrderTableFilters = (",
    replacements: [
      [
        "    const dateFilters = [\n      { label: t(\"fields.createdAt\"), key: \"created_at\" },",
        `    filters.push({ key: "payment_status", label: "Ödeme durumu", type: "select", multiple: true, options: ${options(PAYMENT, "payment")} });\n` +
          `    filters.push({ key: "fulfillment_status", label: "Kargo durumu", type: "select", multiple: true, options: ${options(FULFILLMENT, "fulfillment")} });\n` +
          "    const dateFilters = [\n      { label: t(\"fields.createdAt\"), key: \"created_at\" },",
      ],
    ],
  },
]


// Siparişler kartının içinde, başlığın altında hep açık filtre çubuğu (URL parametrelerini yazar).
const FILTER_BAR = `
var ESCAY_PAYMENT = ${JSON.stringify([["captured","Alındı"],["awaiting","Bekleniyor"],["requires_action","Havale onayı bekleniyor"],["not_paid","Ödenmedi"],["authorized","Yetkilendirildi"],["partially_refunded","Kısmen iade edildi"],["refunded","İade edildi"],["canceled","İptal edildi"]])};
var ESCAY_SHIPPING = ${JSON.stringify([["not_fulfilled","Gönderi yok"],["fulfilled","Etiket hazır"],["shipped","Kargoda"],["delivered","Teslim edildi"],["partially_fulfilled","Kısmen hazır"],["partially_shipped","Kısmen kargoda"],["canceled","İptal"]])};
var ESCAY_PRESETS = ${JSON.stringify([["to_ship","Kargolanacaklar",["captured"],["not_fulfilled","fulfilled"]],["bank","Havale bekleyenler",["requires_action"],[]],["in_transit","Kargoda",[],["shipped"]],["canceled","İptaller",["canceled"],[]]])};
var EscayOrderStatusFilters = () => {
  const [params, setParams] = useSearchParams();
  const read = (k) => (params.get(k) || "").split(",").filter(Boolean);
  const payment = read("payment_status");
  const shipping = read("fulfillment_status");
  const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
  const active = payment.length > 0 || shipping.length > 0;
  const apply = (p, s) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    [["payment_status", p], ["fulfillment_status", s]].forEach(([k, v]) => {
      if (!v) return;
      if (v.length) out.set(k, v.join(","));
      else out.delete(k);
    });
    out.delete("offset");
    return out;
  });
  const sel = (v) => v.length === 0 ? "any" : v.length === 1 ? v[0] : "multi";
  const select = (label, options, values, onChange, key) => jsx("div", { className: "w-56", children: jsxs(Select, {
    size: "small",
    value: sel(values),
    onValueChange: (v) => { if (v !== "multi") onChange(v === "any" ? [] : [v]); },
    children: [
      jsx(Select.Trigger, { children: jsx(Select.Value, {}) }),
      jsxs(Select.Content, { children: [
        jsx(Select.Item, { value: "any", children: label + ": tümü" }, "any"),
        values.length > 1 ? jsx(Select.Item, { value: "multi", children: label + ": birden çok" }, "multi") : null,
        ...options.map((o) => jsx(Select.Item, { value: o[0], children: label + ": " + o[1] }, o[0]))
      ] })
    ]
  }) }, key);
  return jsxs("div", { className: "flex flex-wrap items-center gap-2 px-6 py-3", children: [
    jsx(Button, { size: "small", variant: active ? "transparent" : "primary", onClick: () => apply([], []), children: "Tümü" }, "all"),
    ...ESCAY_PRESETS.map((p) => jsx(Button, { size: "small", variant: same(payment, p[2]) && same(shipping, p[3]) ? "primary" : "transparent", onClick: () => apply(p[2], p[3]), children: p[1] }, p[0])),
    select("Ödeme", ESCAY_PAYMENT, payment, (v) => apply(v, void 0), "pay"),
    select("Kargo", ESCAY_SHIPPING, shipping, (v) => apply(void 0, v), "ship"),
    active ? jsx(Button, { size: "small", variant: "transparent", onClick: () => apply([], []), children: "Temizle" }, "clear") : null
  ] });
};
`

PATCHES.push({
  name: "OrderListTable",
  anchor: "var OrderListTable = () => {",
  replacements: [
    ['import { Button, Container, Heading } from "@medusajs/ui";', 'import { Button, Container, Heading, Select } from "@medusajs/ui";'],
    ['import { Link, Outlet, useLocation } from "react-router-dom";', 'import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";'],
    ["var PAGE_SIZE = 20;\nvar OrderListTable = () => {", FILTER_BAR + "var PAGE_SIZE = 20;\nvar OrderListTable = () => {"],
    [
      '    ] }),\n    /* @__PURE__ */ jsx(\n      _DataTable,',
      '    ] }),\n    /* @__PURE__ */ jsx(EscayOrderStatusFilters, {}),\n    /* @__PURE__ */ jsx(\n      _DataTable,',
    ],
  ],
})

const files = readdirSync(DIST).filter((f) => f.endsWith(".mjs"))
for (const patch of PATCHES) {
  const file = files.find((f) => readFileSync(join(DIST, f), "utf8").includes(patch.anchor))
  if (!file) throw new Error(`[patch-dashboard] ${patch.name} bulunamadı — Medusa sürümü değişti mi?`)
  const path = join(DIST, file)
  let source = readFileSync(path, "utf8")
  if (source.includes(`${MARKER} ${patch.name}`)) {
    console.log(`[patch-dashboard] ${patch.name} zaten yamalı (${file})`)
    continue
  }
  for (const [from, to] of patch.replacements) {
    if (!source.includes(from)) {
      throw new Error(`[patch-dashboard] ${patch.name}: beklenen kod yok (${file}) — Medusa sürümü değişti mi?`)
    }
    source = source.replace(from, to)
  }
  writeFileSync(path, `${MARKER} ${patch.name}\n${source}`)
  console.log(`[patch-dashboard] ${patch.name} yamalandı (${file})`)
}
