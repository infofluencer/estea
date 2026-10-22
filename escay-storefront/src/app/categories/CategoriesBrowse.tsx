"use client"

import { useState } from "react"
import {
  CategoryFilterBar,
  type FilterOption,
  type GridView,
} from "./CategoryFilterBar"
import { type CategoryListProduct } from "./CategoryProductCard"
import { CategoryProductGrid } from "./CategoryProductGrid"

type Props = {
  products: CategoryListProduct[]
  collections: FilterOption[]
  colors: FilterOption[]
  selected: {
    category?: string
    collection?: string
    color?: string
    sort?: string
    q?: string
  }
}

export function CategoriesBrowse({
  products,
  collections,
  colors,
  selected,
}: Props) {
  const [view, setView] = useState<GridView>("grid")

  return (
    <>
      <CategoryFilterBar
        collections={collections}
        colors={colors}
        view={view}
        onViewChange={setView}
        selected={selected}
      />
      <CategoryProductGrid
        products={products}
        view={view}
        category={selected.category}
        collection={selected.collection}
      />
    </>
  )
}
