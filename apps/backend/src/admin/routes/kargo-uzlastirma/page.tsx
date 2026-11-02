import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowPath } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, Textarea } from "@medusajs/ui"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"

type Row = { order_reference?: string; tracking_number?: string; shipment_ref?: string; status?: "shipped" | "delivered" | "" }
type Result = Row & {
  action: "ok" | "attach" | "ship" | "deliver" | "not_found" | "conflict" | "canceled"
  order_id: string | null
  order_display_id: string | null
  fulfillment_id: string | null
  message: string
  applied?: boolean
  error?: string
}

const ACTION_LABEL: Record<Result["action"], { label: string; color: "green" | "orange" | "red" | "grey" | "blue" }> = {
  ok: { label: "Tutarlı", color: "green" },
  attach: { label: "Bağlanacak", color: "blue" },
  ship: { label: "Kargoya verildi işlenecek", color: "blue" },
  deliver: { label: "Teslim işlenecek", color: "blue" },
  not_found: { label: "Bulunamadı", color: "grey" },
  conflict: { label: "Çakışma", color: "red" },
  canceled: { label: "İptal sipariş", color: "orange" },
}

/**
 * Satır biçimi (noktalı virgül, virgül ya da sekme):
 *   ESC-65;TAKIPNO;teslim
 *   ESC-66;TAKIPNO
 *   ;TAKIPNO;kargoda          (sipariş referansı yoksa takip no ile aranır)
 * Başlık satırı (rakam içermeyen ilk satır) atlanır.
 */
export function parseReconcileText(text: string): Row[] {
  const rows: Row[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/[;\t,]/).map((p) => p.trim())
    if (!/\d/.test(line)) continue
    const [order_reference = "", tracking_number = "", statusRaw = ""] = parts
    const s = statusRaw.toLowerCase()
    const status: Row["status"] = /teslim|deliver/.test(s) ? "delivered" : /kargo|ship|transit|yolda/.test(s) ? "shipped" : ""
    if (!order_reference && !tracking_number) continue
    rows.push({ order_reference: order_reference || undefined, tracking_number: tracking_number || undefined, status })
  }
  return rows
}

async function postReconcile(rows: Row[], apply: boolean) {
  const res = await fetch("/admin/escay-shipments/reconcile", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows, apply }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`)
  return json as { apply: boolean; results: Result[] }
}

const ReconcilePage = () => {
  const [text, setText] = useState("")
  const [results, setResults] = useState<Result[] | null>(null)
  const [applied, setApplied] = useState(false)
  const rows = parseReconcileText(text)

  const run = useMutation({
    mutationFn: ({ apply }: { apply: boolean }) => postReconcile(rows, apply),
    onSuccess: (data) => {
      setResults(data.results)
      setApplied(data.apply)
    },
  })

  const actionable = (results || []).filter((r) => ["attach", "ship", "deliver"].includes(r.action)).length

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <Heading level="h1">Kargo uzlaştırma</Heading>
        <Badge size="2xsmall" color={applied ? "green" : "grey"}>{applied ? "Uygulandı" : "Kuru çalışma"}</Badge>
      </div>
      <Text size="small" className="text-ui-fg-subtle">
        Kargo firmasının raporunu satır satır yapıştırın: <span className="font-mono">ESC-65;TAKIPNO;teslim</span>. Önce kontrol edin. "Uygula" eksik kimlikleri siparişe bağlar ve firmanın bildirdiği kargoya verildi / teslim durumunu işler; zaten doğru olan satırlara dokunulmaz.
      </Text>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setResults(null)
          setApplied(false)
        }}
        rows={8}
        placeholder={"ESC-65;143449310574;teslim\nESC-66;143449310581;kargoda\n;143449310598"}
        className="font-mono text-xs"
      />
      <div className="flex items-center gap-2">
        <Button size="small" variant="secondary" isLoading={run.isPending} disabled={!rows.length} onClick={() => run.mutate({ apply: false })}>
          Kontrol et ({rows.length} satır)
        </Button>
        <Button
          size="small"
          variant="primary"
          isLoading={run.isPending}
          disabled={!results || applied || actionable === 0}
          onClick={() => run.mutate({ apply: true })}
        >
          Uygula ({actionable})
        </Button>
        {run.error ? <Text size="small" className="text-ui-fg-error">{(run.error as Error).message}</Text> : null}
      </div>

      {results ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Sipariş</Table.HeaderCell>
              <Table.HeaderCell>Takip / ref</Table.HeaderCell>
              <Table.HeaderCell>Firma durumu</Table.HeaderCell>
              <Table.HeaderCell>Sonuç</Table.HeaderCell>
              <Table.HeaderCell>Açıklama</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {results.map((r, i) => {
              const a = ACTION_LABEL[r.action] || ACTION_LABEL.not_found
              return (
                <Table.Row key={`${r.order_reference || ""}-${r.tracking_number || ""}-${i}`}>
                  <Table.Cell>
                    {r.order_id ? (
                      <Link to={`/orders/${r.order_id}`} className="underline">#{r.order_display_id || r.order_reference}</Link>
                    ) : (
                      r.order_reference || "—"
                    )}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs">{r.tracking_number || r.shipment_ref || "—"}</Table.Cell>
                  <Table.Cell>{r.status === "delivered" ? "Teslim" : r.status === "shipped" ? "Kargoda" : "—"}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-1">
                      <Badge size="2xsmall" color={a.color}>{a.label}</Badge>
                      {r.applied === true ? <Badge size="2xsmall" color="green">Yapıldı</Badge> : null}
                      {r.applied === false ? <Badge size="2xsmall" color="red">Hata</Badge> : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="xsmall">{r.error || r.message}</Text>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      ) : null}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Kargo uzlaştırma", icon: ArrowPath })

export default ReconcilePage
