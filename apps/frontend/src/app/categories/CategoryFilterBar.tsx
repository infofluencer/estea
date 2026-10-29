"use client"

import { useRouter } from "next/navigation"
import { FilterDropdown } from "./FilterDropdown"
import styles from "./categories.module.css"
import { listingPath } from "@/lib/urls"

export type FilterOption = {
  value: string
  label: string
}

export type GridView = "large" | "grid"

type Props = {
  collections: FilterOption[]
  colors: FilterOption[]
  view: GridView
  onViewChange: (view: GridView) => void
  selected: {
    category?: string
    collection?: string
    color?: string
    sort?: string
    q?: string
  }
}

const SORT_OPTIONS: FilterOption[] = [
  { value: "newest", label: "Yeniler" },
  { value: "price-asc", label: "Fiyat artan" },
  { value: "price-desc", label: "Fiyat azalan" },
]

function buildHref(
  selected: Props["selected"],
  patch: Partial<Props["selected"]>
) {
  const next = { ...selected, ...patch }
  const params = new URLSearchParams()

  if (next.color) params.set("color", next.color)
  if (next.sort && next.sort !== "newest") params.set("sort", next.sort)
  if (next.q?.trim()) params.set("q", next.q.trim())

  return listingPath(
    // Koleksiyon seçilince kategori yolu düşer (koleksiyon sayfası)
    next.collection ? { collection: next.collection } : { category: next.category },
    params
  )
}

export function CategoryFilterBar({
  collections,
  colors,
  view,
  onViewChange,
  selected,
}: Props) {
  const router = useRouter()

  function setFilter(key: keyof Props["selected"], value: string) {
    const next = value || undefined
    router.push(buildHref(selected, { [key]: next }))
  }

  const collectionOptions: FilterOption[] = [
    { value: "", label: "Tümü" },
    ...collections,
  ]
  const colorOptions: FilterOption[] = [
    { value: "", label: "Tümü" },
    ...colors,
  ]

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterGroup}>
        <FilterDropdown
          label="Koleksiyon"
          menuTitle="Koleksiyon seçin"
          value={selected.collection || ""}
          options={collectionOptions}
          onChange={(v) => setFilter("collection", v)}
        />
        <FilterDropdown
          label="Seçenek"
          menuTitle="Seçenek seçin"
          value={selected.color || ""}
          options={colorOptions}
          onChange={(v) => setFilter("color", v)}
          disabled={colors.length === 0}
        />
      </div>

      <div className={styles.filterTrailing}>
        <div className={styles.viewField}>
          <span className={styles.filterLabel}>Görünüm</span>
          <div className={styles.viewToggle} role="group" aria-label="Görünüm">
            <button
              type="button"
              className={`${styles.viewBtn} ${
                view === "large" ? styles.viewBtnActive : ""
              }`}
              aria-pressed={view === "large"}
              aria-label="Geniş görünüm"
              onClick={() => onViewChange("large")}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <rect x="2.5" y="2.5" width="5.5" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="10" y="2.5" width="5.5" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${
                view === "grid" ? styles.viewBtnActive : ""
              }`}
              aria-pressed={view === "grid"}
              aria-label="Izgara görünümü"
              onClick={() => onViewChange("grid")}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <rect x="2" y="2" width="3.5" height="14" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
                <rect x="7.25" y="2" width="3.5" height="14" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
                <rect x="12.5" y="2" width="3.5" height="14" rx="0.8" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        </div>

        <FilterDropdown
          label="Sıralama"
          menuTitle="Sıralama seçin"
          value={selected.sort || "newest"}
          options={SORT_OPTIONS}
          onChange={(v) => setFilter("sort", v)}
          align="right"
        />
      </div>
    </div>
  )
}
