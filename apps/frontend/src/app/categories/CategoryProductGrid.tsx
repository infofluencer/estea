"use client"

import {
  CategoryProductCard,
  type CategoryListProduct,
} from "./CategoryProductCard"
import type { GridView } from "./CategoryFilterBar"
import styles from "./categories.module.css"

const PRIORITY_IMAGE_COUNT = 16

/**
 * Kategori ürün ızgarası. (Eski S3 editoryal vitrin kutuları kaldırıldı;
 * kategori görselleri gerekirse ayrı bir banner bileşeniyle sayfa başına eklenir.)
 */
export function CategoryProductGrid({
  products,
  view = "grid",
}: {
  products: CategoryListProduct[]
  view?: GridView
  category?: string
  collection?: string
}) {
  if (products.length === 0) {
    return <p className={styles.empty}>Bu filtrelere uygun ürün bulunamadı.</p>
  }

  const gridClass = `${styles.grid} ${
    view === "large" ? styles.gridLarge : styles.gridDense
  }`

  return (
    <ul data-category-grid className={gridClass}>
      {products.map((product, index) => (
        <li key={product.cardKey} className={styles.gridItem}>
          <CategoryProductCard
            product={product}
            priority={index < PRIORITY_IMAGE_COUNT}
          />
        </li>
      ))}
    </ul>
  )
}
