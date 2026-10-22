import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useParams } from "react-router-dom"

type LocationLevel = {
  id: string
  location_id: string
  stocked_quantity: number
  reserved_quantity: number
  available_quantity: number
}

type InventoryItem = {
  id: string
  sku?: string | null
  title?: string | null
  location_levels?: LocationLevel[] | null
}

type VariantPayload = {
  variant?: {
    id: string
    title?: string | null
    sku?: string | null
    manage_inventory?: boolean | null
    inventory_items?: { inventory_item_id: string; required_quantity?: number | null }[] | null
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Varyant detayı — hızlı stok ekle / çıkar / sayım.
 *
 * ⌘K aramasında stok kodu (SKU) yazınca "Ürün Varyantları" veya "Envanter"
 * altında çıkan sonuca tıklanınca açılan sayfada (varyant / envanter kalemi)
 * görünür. Değişiklik Medusa envanter seviyesine yazılır
 * (inventory-level.updated olayı yayılır).
 */
const VariantStockWidget = () => {
  const params = useParams()
  // Varyant sayfası: /products/:id/variants/:variant_id · Envanter sayfası: /inventory/:id
  const variantId = params.variant_id
  const productId = variantId ? params.id : undefined
  const inventoryPageItemId = variantId ? undefined : params.id
  const qc = useQueryClient()
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  const variantQ = useQuery({
    queryKey: ["escay-variant-stock", productId, variantId],
    enabled: Boolean(productId && variantId),
    queryFn: () =>
      getJson<VariantPayload>(
        `/admin/products/${productId}/variants/${variantId}?fields=id,title,sku,manage_inventory,inventory_items.inventory_item_id,inventory_items.required_quantity`
      ),
  })

  const itemIds = inventoryPageItemId
    ? [inventoryPageItemId]
    : (variantQ.data?.variant?.inventory_items || []).map((i) => i.inventory_item_id)

  const itemsQ = useQuery({
    queryKey: ["escay-variant-stock-items", itemIds.join(",")],
    enabled: itemIds.length > 0,
    queryFn: async () =>
      Promise.all(
        itemIds.map((iid) =>
          getJson<{ inventory_item: InventoryItem }>(
            `/admin/inventory-items/${iid}?fields=id,sku,title,location_levels.id,location_levels.location_id,location_levels.stocked_quantity,location_levels.reserved_quantity,location_levels.available_quantity`
          ).then((r) => r.inventory_item)
        )
      ),
  })

  const locationsQ = useQuery({
    queryKey: ["escay-stock-locations"],
    queryFn: () => getJson<{ stock_locations: { id: string; name: string }[] }>(`/admin/stock-locations?fields=id,name&limit=50`),
  })
  const locationName = (id: string) => locationsQ.data?.stock_locations.find((l) => l.id === id)?.name || id

  const update = useMutation({
    mutationFn: async (input: { itemId: string; locationId: string; stocked: number }) => {
      const res = await fetch(`/admin/inventory-items/${input.itemId}/location-levels/${input.locationId}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stocked_quantity: input.stocked }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`)
      return input
    },
    onSuccess: (input) => {
      toast.success(`Stok güncellendi: ${input.stocked}`)
      setAmounts((a) => ({ ...a, [`${input.itemId}:${input.locationId}`]: "" }))
      void qc.invalidateQueries()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const firstItem = itemsQ.data?.[0]
  const variant = inventoryPageItemId
    ? firstItem
      ? { id: firstItem.id, title: firstItem.title, sku: firstItem.sku, manage_inventory: true }
      : null
    : variantQ.data?.variant
  if (!variant) return null

  const apply = (item: InventoryItem, level: LocationLevel, mode: "add" | "remove" | "set") => {
    const key = `${item.id}:${level.location_id}`
    const n = Math.floor(Number(amounts[key] || (mode === "set" ? "" : "1")))
    if (!Number.isFinite(n) || n < 0 || (mode !== "set" && n === 0)) {
      toast.error("Geçerli bir adet girin.")
      return
    }
    const current = Number(level.stocked_quantity) || 0
    const next = mode === "add" ? current + n : mode === "remove" ? current - n : n
    if (next < 0) {
      toast.error(`Stok eksiye düşemez (mevcut ${current}).`)
      return
    }
    if (next < (Number(level.reserved_quantity) || 0)) {
      toast.warning(`Dikkat: ${level.reserved_quantity} adet ödeme/kargo bekleyen siparişlere ayrılmış.`)
    }
    update.mutate({ itemId: item.id, locationId: level.location_id, stocked: next })
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Hızlı stok</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Stok kodu: <span className="font-mono text-ui-fg-base">{variant.sku || "—"}</span>
            {variant.title ? ` · ${variant.title}` : ""}
          </Text>
        </div>
      </div>

      {variant.manage_inventory === false ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">
          Bu varyantta stok takibi kapalı ("Envanteri yönet" kapalı).
        </Text>
      ) : itemsQ.isLoading || (!inventoryPageItemId && variantQ.isLoading) ? (
        <Text size="small" className="px-6 py-4 text-ui-fg-subtle">Yükleniyor…</Text>
      ) : (
        (itemsQ.data || []).map((item) => (
          <div key={item.id} className="flex flex-col gap-3 px-6 py-4">
            {itemIds.length > 1 ? (
              <Text size="small" weight="plus">{item.title || item.sku}</Text>
            ) : null}
            {(item.location_levels || []).length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                Bu ürün hiçbir stok konumuna bağlı değil — envanter kaleminden konum ekleyin.
              </Text>
            ) : (
              (item.location_levels || []).map((level) => {
                const key = `${item.id}:${level.location_id}`
                return (
                  <div key={key} className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[180px]">
                      <Text size="small" weight="plus">{locationName(level.location_id)}</Text>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <Badge size="2xsmall" color="grey">Stok {level.stocked_quantity}</Badge>
                        <Badge size="2xsmall" color="orange">Ayrılmış {level.reserved_quantity}</Badge>
                        <Badge size="2xsmall" color={level.available_quantity > 0 ? "green" : "red"}>
                          Satılabilir {level.available_quantity}
                        </Badge>
                      </div>
                    </div>
                    <Input
                      size="small"
                      type="number"
                      min={0}
                      placeholder="1"
                      className="w-20"
                      value={amounts[key] ?? ""}
                      onChange={(e) => setAmounts((a) => ({ ...a, [key]: e.target.value }))}
                    />
                    <Button size="small" variant="primary" isLoading={update.isPending} onClick={() => apply(item, level, "add")}>
                      + Ekle
                    </Button>
                    <Button size="small" variant="secondary" isLoading={update.isPending} onClick={() => apply(item, level, "remove")}>
                      − Çıkar
                    </Button>
                    <Button size="small" variant="transparent" isLoading={update.isPending} onClick={() => apply(item, level, "set")}>
                      Sayım: tam değer yaz
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        ))
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: ["product_variant.details.side.before", "inventory_item.details.side.before"],
})

export default VariantStockWidget
