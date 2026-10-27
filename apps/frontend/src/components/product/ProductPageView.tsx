"use client"

import { useMemo, useState, type MouseEvent } from "react"
import { AddToCartButton } from "@/components/AddToCartButton"
import { useFavorites } from "@/components/FavoritesProvider"
import { ProductAccordion } from "@/components/product/ProductAccordion"
import { ProductGallery } from "@/components/product/ProductGallery"
import { SpecIcon } from "@/components/product/SpecIcon"
import { formatTry, variantOriginalAmount, variantPriceAmount } from "@/lib/medusa"
import { isVariantInStock, lowStockLabelForVariant } from "@/lib/stock"
import {
  displayColor,
  variantGalleryUrls,
  variantImageUrl,
} from "@/lib/product-images"
import type { SpecIconName } from "@/lib/spec-labels"
import styles from "./product.module.css"

type OptionValue = { id: string; value: string }
type Option = { id: string; title: string; values: OptionValue[] }

type Variant = {
  id: string
  title: string | null
  sku?: string | null
  inventory_quantity?: number | null
  manage_inventory?: boolean
  allow_backorder?: boolean
  calculated_price?: {
    calculated_amount?: number | null
    original_amount?: number | null
  }
  options?: { option_id: string | null | undefined; value: string }[]
}

type SpecEntry = {
  key: string
  label: string
  icon: SpecIconName
  value: string
}

export type ProductPageViewProps = {
  id: string
  title: string
  handle: string
  story: string | null
  thumbnail: string | null
  images: string[]
  productSku: string | null
  options: Option[]
  variants: Variant[]
  specEntries: SpecEntry[]
  /** Crop 9:16 canvases to the centered square artwork. */
  squareGallery?: boolean
  /** Prefill from category card deep-link (`?v=` / `?color=`). */
  initialVariantId?: string | null
  initialColor?: string | null
}

function variantForValue(
  variants: Variant[],
  optionId: string,
  value: string
): Variant | undefined {
  return variants.find((v) => {
    const opts = v.options || []
    if (
      opts.some(
        (o) =>
          (o.option_id == null || o.option_id === optionId) && o.value === value
      )
    ) {
      return true
    }
    return v.title === value
  })
}

function variantMatchesSelection(
  variant: Variant,
  selected: Record<string, string>
): boolean {
  const opts = variant.options || []
  if (!opts.length) {
    const title = variant.title?.trim()
    return Boolean(title && Object.values(selected).includes(title))
  }
  return opts.every((o) => {
    if (o.option_id != null && o.option_id in selected) {
      return selected[o.option_id] === o.value
    }
    return Object.values(selected).includes(o.value)
  })
}

function selectedColorName(
  primaryOption: Option | undefined,
  selected: Record<string, string>
): string | null {
  if (!primaryOption) return null
  return selected[primaryOption.id] || null
}

export function ProductPageView({
  id,
  title,
  handle,
  story,
  thumbnail,
  images,
  productSku,
  options,
  variants,
  specEntries,
  initialVariantId = null,
  initialColor = null,
  squareGallery = false,
}: ProductPageViewProps) {
  const { isFavorite, toggleFavorite } = useFavorites()
  const favorited = isFavorite(id)

  const primaryOption = options[0]
  const colorCount = variants.length || primaryOption?.values.length || 0

  const [openAccordionId, setOpenAccordionId] = useState<string | null>(() =>
    specEntries[0]?.key ?? null
  )

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}

    const fromVariant = initialVariantId
      ? variants.find((v) => v.id === initialVariantId)
      : undefined

    if (fromVariant) {
      for (const opt of options) {
        const match =
          (fromVariant.options || []).find((o) => o.option_id === opt.id) ||
          (fromVariant.options || []).find((o) =>
            opt.values.some((val) => val.value === o.value)
          )
        initial[opt.id] =
          match?.value ||
          (fromVariant.title &&
          opt.values.some((val) => val.value === fromVariant.title)
            ? fromVariant.title
            : "") ||
          opt.values[0]?.value ||
          ""
      }
      return initial
    }

    const colorNeedle = initialColor?.trim().toLocaleLowerCase("tr")
    for (const opt of options) {
      const byColor =
        colorNeedle &&
        opt.values.find(
          (val) => val.value.toLocaleLowerCase("tr") === colorNeedle
        )
      if (byColor) {
        initial[opt.id] = byColor.value
        continue
      }
      const inStockVal = opt.values.find((val) => {
        const match = variantForValue(variants, opt.id, val.value)
        return isVariantInStock(match)
      })
      initial[opt.id] = (inStockVal || opt.values[0])?.value || ""
    }
    return initial
  })

  const variant = useMemo(
    () => variants.find((v) => variantMatchesSelection(v, selected)),
    [variants, selected]
  )

  const inStock = isVariantInStock(variant)
  const lowStock =
    variant && inStock ? lowStockLabelForVariant(variant) : null
  const calculated = variantPriceAmount(variant?.calculated_price)
  const original = variantOriginalAmount(variant?.calculated_price)
  const onSale =
    original != null &&
    calculated != null &&
    Number(original) > Number(calculated)

  const activeColor = selectedColorName(primaryOption, selected)

  const galleryImages = useMemo(() => {
    const fromColor = variantGalleryUrls(productSku, activeColor, handle)
    if (fromColor.length) return fromColor
    const urls = images.length ? images : thumbnail ? [thumbnail] : []
    return [...new Set(urls.filter(Boolean))]
  }, [images, thumbnail, productSku, activeColor, handle])

  const variantHeroImage = useMemo(() => {
    if (!activeColor) return null
    return variantImageUrl(productSku, activeColor, handle)
  }, [activeColor, productSku, handle])

  const displayImage =
    variantHeroImage || galleryImages[0] || thumbnail

  const displaySku =
    (typeof variant?.sku === "string" && variant.sku.trim()) ||
    productSku ||
    null

  function toggleAccordion(id: string) {
    setOpenAccordionId((current) => (current === id ? null : id))
  }

  function onToggleFavorite(e: MouseEvent) {
    e.preventDefault()
    toggleFavorite({
      id,
      handle,
      title,
      price: calculated == null ? null : Number(calculated),
      image: displayImage,
      variantId: variant?.id ?? null,
    })
  }

  function selectValue(optionId: string, value: string) {
    setSelected((prev) => ({ ...prev, [optionId]: value }))
  }

  return (
    <article className={styles.page}>
      <section className={styles.heroStage}>
        <ProductGallery
          images={galleryImages}
          productTitle={title}
          square={squareGallery}
        />

        <aside className={styles.purchasePanel}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
            <button
              type="button"
              className={`${styles.fav}${favorited ? ` ${styles.favActive}` : ""}`}
              onClick={onToggleFavorite}
              aria-label={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
              title={favorited ? "Favorilerden çıkar" : "Favorilere ekle"}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={favorited ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>

          {primaryOption &&
          primaryOption.values.some((val) => displayColor(val.value)) ? (
            <div className={styles.variantSection}>
              <p className={styles.variantLabel}>
                {primaryOption.title}
                {activeColor ? (
                  <>
                    {": "}
                    <span className={styles.variantValue}>{activeColor}</span>
                  </>
                ) : null}
                {colorCount > 1 ? (
                  <span className={styles.colorCount}>
                    {" "}
                    ({colorCount} seçenek)
                  </span>
                ) : null}
              </p>
              <div
                className={styles.variantGrid}
                role="listbox"
                aria-label={primaryOption.title}
              >
                {primaryOption.values.map((val) => {
                  const match = variantForValue(
                    variants,
                    primaryOption.id,
                    val.value
                  )
                  const soldOut = !isVariantInStock(match)
                  const isSelected = selected[primaryOption.id] === val.value
                  const swatchImage =
                    variantImageUrl(productSku, val.value, handle) ||
                    thumbnail

                  return (
                    <button
                      key={val.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-label={
                        soldOut ? `${val.value}, tükendi` : val.value
                      }
                      className={`${styles.swatch}${isSelected ? ` ${styles.swatchSelected}` : ""}${soldOut ? ` ${styles.swatchSoldOut}` : ""}`}
                      onClick={() =>
                        selectValue(primaryOption.id, val.value)
                      }
                      title={soldOut ? `${val.value} — Tükendi` : val.value}
                    >
                      <span className={styles.swatchMedia}>
                        {swatchImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={swatchImage}
                            alt=""
                            className={styles.swatchImg}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span className={styles.swatchFallback}>
                            {val.value}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : activeColor || colorCount > 1 ? (
            <p className={styles.colorMeta}>
              {activeColor ? <span>{activeColor}</span> : null}
              {colorCount > 1 ? (
                <span className={styles.colorCount}>({colorCount} seçenek)</span>
              ) : null}
            </p>
          ) : null}

          <div className={styles.priceBlock}>
            <div className={styles.priceRow}>
              <span className={styles.priceCurrent}>{formatTry(calculated)}</span>
              {onSale ? (
                <span className={styles.priceOriginal}>
                  {formatTry(original)}
                </span>
              ) : null}
            </div>
            <p className={styles.priceNote}>KDV dahil</p>
            {lowStock ? (
              <p
                className={`${styles.lowStockNote}${
                  lowStock.kind === "critical"
                    ? ` ${styles.lowStockNoteCritical}`
                    : ""
                }`}
                role="status"
              >
                {lowStock.text}
              </p>
            ) : null}
          </div>

          {inStock ? (
            <AddToCartButton
              variantId={variant?.id || ""}
              title={title}
              image={displayImage}
              price={calculated ?? null}
              className={styles.addToCart}
              disabled={!variant?.id}
            />
          ) : (
            <button type="button" className={styles.soldOutBtn} disabled>
              Tükendi
            </button>
          )}

        </aside>
      </section>

      {story || specEntries.length > 0 || displaySku ? (
        <section
          className={`${styles.detailsStage}${specEntries.length === 0 ? ` ${styles.detailsStageSingle}` : ""}`}
        >
          <div className={styles.detailsCopy}>
            {story
              ? story
                  .split(/\n{2,}/)
                  .map((paragraph, i) => (
                    <p key={i} className={styles.storyText}>
                      {paragraph}
                    </p>
                  ))
              : null}
            {displaySku ? (
              <p className={styles.skuRow}>
                <span className={styles.skuLabel}>Stok kodu:</span>{" "}
                <span className={styles.skuValue}>{displaySku}</span>
              </p>
            ) : null}
          </div>

          {specEntries.length > 0 ? (
            <div className={styles.detailsAccordions}>
              {specEntries.map(({ key, label, icon, value }) => (
                <ProductAccordion
                  key={key}
                  itemId={key}
                  open={openAccordionId === key}
                  onToggle={toggleAccordion}
                  title={label}
                  icon={<SpecIcon name={icon} />}
                >
                  {value.includes("\n") ? (
                    <ul className={`${styles.bodyText} ${styles.bodyList}`}>
                      {value.split("\n").map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.bodyText}>{value}</p>
                  )}
                </ProductAccordion>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  )
}
