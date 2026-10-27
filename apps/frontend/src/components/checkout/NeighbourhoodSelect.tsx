"use client"

import { useEffect, useState, type Ref } from "react"
import { trCityCodeForName } from "@escay/shared/tr-address"

/** "Listede yok" seçeneği — serbest metin kutusunu açar. */
const OTHER = "__other__"

type CityNeighbourhoods = Record<string, string[]>

// İl dosyaları (public/tr-mahalle/<plaka>.json) sayfa ömrü boyunca bir kez çekilir.
const cache = new Map<string, Promise<CityNeighbourhoods>>()

function loadCity(code: string): Promise<CityNeighbourhoods> {
  let pending = cache.get(code)
  if (!pending) {
    pending = fetch(`/tr-mahalle/${code}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch((e) => {
        cache.delete(code)
        throw e
      })
    cache.set(code, pending)
  }
  return pending
}

/** İlçenin mahalleleri; null = yükleniyor / il-ilçe seçilmedi, [] = veri yok. */
function useNeighbourhoods(cityName: string, district: string): string[] | null {
  const code = trCityCodeForName(cityName)
  const key = code && district ? `${code}|${district}` : ""
  const [state, setState] = useState<{ key: string; list: string[] } | null>(null)

  useEffect(() => {
    if (!code || !district) return
    let alive = true
    loadCity(code)
      .then((data) => alive && setState({ key, list: data[district] ?? [] }))
      // Dosya yüklenemezse serbest metne düş.
      .catch(() => alive && setState({ key, list: [] }))
    return () => {
      alive = false
    }
  }, [code, district, key])

  return state?.key === key ? state.list : null
}

export function NeighbourhoodSelect({
  city,
  district,
  value,
  onChange,
  selectRef,
  id,
  className,
  inputClassName,
  invalid,
  testId,
}: {
  city: string
  district: string
  value: string
  onChange: (value: string) => void
  selectRef?: Ref<HTMLSelectElement>
  id?: string
  className?: string
  inputClassName?: string
  invalid?: boolean
  testId?: string
}) {
  const list = useNeighbourhoods(city, district)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    setManual(false)
  }, [district])

  const loaded = list !== null
  // Kayıtlı/eski adres listede olmayan bir mahalle içerebilir → serbest metin.
  const isManual =
    loaded && (list.length === 0 || manual || (value !== "" && !list.includes(value)))

  return (
    <>
      <select
        ref={selectRef}
        id={id}
        data-testid={testId}
        className={className}
        aria-invalid={invalid}
        disabled={!district || !loaded}
        value={isManual ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setManual(true)
            onChange("")
          } else {
            setManual(false)
            onChange(e.target.value)
          }
        }}
      >
        <option value="">
          {!district ? "Önce ilçe seçin" : loaded ? "Mahalle seçin" : "Yükleniyor…"}
        </option>
        {list?.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        {loaded && <option value={OTHER}>Listede yok — elle yaz</option>}
      </select>
      {isManual && (
        <input
          data-testid={testId ? `${testId}-manual` : undefined}
          className={inputClassName}
          aria-invalid={invalid}
          placeholder="Mahalle adı"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  )
}
