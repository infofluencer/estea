import { Button, Input, Select, Text, Textarea } from "@medusajs/ui"
import { useState } from "react"

export type ExchangeFormChoice = { variant_id: string; title: string; sku?: string | null; available: number | null }
export type ExchangeFormLine = {
  key: string
  title: string
  /** Mevcut gramaj/çeşit */
  variant: string | null
  max: number
  choices: ExchangeFormChoice[]
  /** Ürün mağazada eşleşmedi vb. */
  disabledReason?: string | null
}

export type ExchangeFormSelection = { key: string; quantity: number; variant_id: string }

/**
 * Basit değişim formu: her ürün için adet + yeni gramaj/çeşit. Stokta olmayan
 * seçenekler listede ama seçilemez. Hiç adet girilmeyen satır gönderilmez.
 */
export function ExchangeForm({
  lines,
  submitLabel,
  busy,
  withNote,
  onSubmit,
  onCancel,
}: {
  lines: ExchangeFormLine[]
  submitLabel: string
  busy?: boolean
  withNote?: boolean
  onSubmit: (selections: ExchangeFormSelection[], note: string) => void
  onCancel?: () => void
}) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [variant, setVariant] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")

  const selections: ExchangeFormSelection[] = lines
    .filter((l) => (qty[l.key] ?? 0) > 0 && variant[l.key])
    .map((l) => ({ key: l.key, quantity: qty[l.key], variant_id: variant[l.key] }))
  const incomplete = lines.some((l) => (qty[l.key] ?? 0) > 0 && !variant[l.key])
  const usable = lines.filter((l) => l.max > 0 && !l.disabledReason)

  if (!usable.length) {
    return (
      <Text size="small" className="text-ui-fg-subtle">
        Değiştirilebilecek ürün yok{lines.find((l) => l.disabledReason) ? ` (${lines.find((l) => l.disabledReason)!.disabledReason})` : ""}.
      </Text>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {lines.map((l) => (
        <div key={l.key} className="flex flex-col gap-1 border-b border-ui-border-base pb-2 last:border-0">
          <Text size="small" weight="plus">
            {l.title}
            {l.variant ? <span className="text-ui-fg-subtle"> · şu an {l.variant}</span> : null}
          </Text>
          {l.disabledReason ? (
            <Text size="xsmall" className="text-ui-fg-error">{l.disabledReason}</Text>
          ) : l.max <= 0 ? (
            <Text size="xsmall" className="text-ui-fg-subtle">Değiştirilebilir adet kalmadı.</Text>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                size="small"
                type="number"
                min={0}
                max={l.max}
                className="w-[70px]"
                value={qty[l.key] ?? 0}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(l.max, Math.floor(Number(e.target.value) || 0)))
                  setQty((p) => ({ ...p, [l.key]: n }))
                }}
              />
              <Text size="xsmall" className="text-ui-fg-subtle">/ {l.max} adet</Text>
              <Select size="small" value={variant[l.key] || ""} onValueChange={(v) => setVariant((p) => ({ ...p, [l.key]: v }))}>
                <Select.Trigger className="w-[220px]">
                  <Select.Value placeholder="Yeni gramaj / çeşit" />
                </Select.Trigger>
                <Select.Content>
                  {l.choices.map((c) => (
                    <Select.Item key={c.variant_id} value={c.variant_id} disabled={c.available !== null && c.available <= 0}>
                      {c.title}
                      {c.available === null ? "" : c.available > 0 ? ` (stok ${c.available})` : " (stok yok)"}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          )}
        </div>
      ))}
      {withNote ? (
        <Textarea
          rows={2}
          placeholder="Not (isteğe bağlı)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="small" variant="primary" isLoading={busy} disabled={busy || !selections.length || incomplete} onClick={() => onSubmit(selections, note)}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button size="small" variant="secondary" disabled={busy} onClick={onCancel}>
            Vazgeç
          </Button>
        ) : null}
      </div>
      {incomplete ? (
        <Text size="xsmall" className="text-ui-fg-error">Adet girilen her ürün için yeni gramaj/çeşit seçin.</Text>
      ) : null}
    </div>
  )
}

export const EXCHANGE_STATE_BADGE: Record<string, { label: string; color: "green" | "orange" | "red" | "grey" | "blue" }> = {
  awaiting_return: { label: "Ürün bekleniyor", color: "orange" },
  to_ship: { label: "Gönderi açılacak", color: "blue" },
  failed: { label: "Gönderi açılamadı", color: "red" },
  label_ready: { label: "Etiket hazır", color: "blue" },
  shipped: { label: "Kargoda", color: "green" },
  delivered: { label: "Teslim edildi", color: "green" },
  rejected: { label: "İade reddedildi", color: "grey" },
  canceled: { label: "İptal", color: "grey" },
}

export async function postJson(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
  return json
}
