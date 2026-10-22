import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
} from "@medusajs/framework/types"

import "./adapters"
import { parsePackageProfile, resolvePackage, type PackageItemInput, type PackageProfile } from "./package-profile"
import { mapItems, mapRecipientAddress, type MedusaAddressLike, type MedusaLineItemLike } from "./recipient"
import {
  buildOrderReference,
  carrierTestMode,
  configuredCarrierCode,
  getCarrierFor,
  getConfiguredCarrier,
} from "./registry"
import {
  CARRIER_FULFILLMENT_OPTION_ID,
  CARRIER_RETURN_OPTION_ID,
  mergeFulfillmentData,
  type CarrierAdapter,
  type FulfillmentData,
  type LabelRow,
} from "./types"

type InjectedDependencies = { logger: Logger }

export type CarrierRawOptions = {
  /** SHIPPING_PACKAGE_DEFAULT JSON — varsayılan koli. */
  packageProfile?: string
  /** Checkout ilçe gelmezse son çare ilçe (normalde boş; checkout ilçe toplar). */
  defaultDistrict?: string
  /** Adaptör teklif vermezse / hata verirse checkout kargo ücreti (TL, KDV dahil). */
  fallbackShippingPrice?: string | number
}

/**
 * Generic kargo fulfillment provider — `carrier_carrier`.
 *
 * Firma mantığı yok: alıcı/koli/kalem hazırlanır, `SHIPPING_CARRIER` ile seçilen
 * adaptöre devredilir, dönen veri normalize `fulfillment.data` anahtarlarıyla
 * saklanır. Adaptör yoksa fulfillment yine oluşur (elle kargo gibi): data
 * `{ carrier: "manual" }`, etiket yok — admin takip no girer.
 */
class CarrierFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "carrier"

  protected readonly logger_: Logger
  protected readonly packageProfile_: PackageProfile
  protected readonly defaultDistrict_?: string
  protected readonly fallbackShippingPrice_: number

  constructor(container: InjectedDependencies, options: CarrierRawOptions = {}) {
    super()
    this.logger_ = container.logger
    this.packageProfile_ = parsePackageProfile(options.packageProfile)
    this.defaultDistrict_ = options.defaultDistrict?.trim() || undefined
    const fb = Number(options.fallbackShippingPrice)
    this.fallbackShippingPrice_ = Number.isFinite(fb) && fb > 0 ? fb : 149.9
  }

  static validateOptions(_options: Record<string, unknown>) {
    const code = configuredCarrierCode()
    if (code && !getConfiguredCarrier()) {
      // Boot'u düşürme: yanlış kodla da panel açılsın, fulfillment anında anlaşılır hata ver.
      console.warn(`[carrier] SHIPPING_CARRIER="${code}" için kayıtlı adaptör yok (src/modules/carrier/adapters).`)
    }
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    const adapter = getConfiguredCarrier()
    const name = adapter ? adapter.name : "Kargo"
    return [
      { id: CARRIER_FULFILLMENT_OPTION_ID, name: `${name} — Standart`, is_return: false },
      { id: CARRIER_RETURN_OPTION_ID, name: `${name} — İade`, is_return: true },
    ]
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    const id = String(data?.id ?? "")
    return id === CARRIER_FULFILLMENT_OPTION_ID || id === CARRIER_RETURN_OPTION_ID || Object.keys(data ?? {}).length > 0
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return { ...data }
  }

  async canCalculate(): Promise<boolean> {
    return Boolean(getConfiguredCarrier()?.quote)
  }

  /** `price_type: calculated` → adaptör teklifi; hata/teklif yoksa checkout DURMAZ, yedek fiyat. */
  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    const fallback = { calculated_amount: this.fallbackShippingPrice_, is_calculated_price_tax_inclusive: true }
    const adapter = getConfiguredCarrier()
    if (!adapter?.quote) return fallback
    const items = (context?.items ?? []).map((item) => ({
      quantity: Number(item?.quantity ?? 1),
      metadata: (item?.metadata as Record<string, unknown> | null) ?? null,
    }))
    const parcel = resolvePackage(items, this.packageProfile_)
    const shipping = (context as { shipping_address?: MedusaAddressLike } | undefined)?.shipping_address
    const cityCode = shipping ? mapRecipientAddress(shipping, "x@x", {}).value.cityCode || null : null
    try {
      const amount = await adapter.quote(parcel, cityCode)
      if (amount === null || !Number.isFinite(amount) || amount <= 0) return fallback
      return { calculated_amount: Math.round(amount * 100) / 100, is_calculated_price_tax_inclusive: true }
    } catch (error) {
      this.logger_.warn(`[carrier] ${adapter.code} teklif alınamadı — yedek ${fallback.calculated_amount} TL: ${String(error)}`)
      return fallback
    }
  }

  /**
   * Fulfillment yaratıldığında (ödeme sonrası otomatik veya admin) çağrılır.
   * Adaptör yoksa gönderi açılmaz; kayıt `carrier: manual` ile oluşur.
   */
  async createFulfillment(
    _data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>
  ): Promise<CreateFulfillmentResult> {
    const adapter = getConfiguredCarrier()
    const fulMeta = (fulfillment?.metadata || {}) as Record<string, unknown>
    const isExchange = Boolean(fulMeta.escay_exchange_return_id)
    const reference = buildOrderReference(order?.display_id, { exchange: isExchange })

    if (!adapter) {
      const code = configuredCarrierCode()
      if (code) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `SHIPPING_CARRIER="${code}" için adaptör yok. Kargo elle yürütülecekse SHIPPING_CARRIER'ı boş bırakın.`
        )
      }
      return {
        data: { carrier: "manual", order_reference: reference, updated_at: new Date().toISOString() },
        labels: [],
      }
    }

    const deliveryAddress = (fulfillment?.delivery_address ?? order?.shipping_address) as MedusaAddressLike | undefined
    if (!deliveryAddress) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Kargo gönderisi oluşturulamadı: siparişte teslimat adresi yok.")
    }

    // createOrderFulfillmentWorkflow provider'a order.email vermez → metadata yedekleri (auto-fulfill yazar).
    const orderRecord = order as (Partial<FulfillmentOrderDTO> & { customer?: { email?: string | null } | null }) | undefined
    const pick = (...cands: unknown[]) => {
      for (const c of cands) if (typeof c === "string" && c.trim()) return c.trim()
      return ""
    }
    const addressMeta = (deliveryAddress.metadata || null) as Record<string, unknown> | null
    const orderMeta = (orderRecord?.metadata || null) as Record<string, unknown> | null
    const email = pick(orderRecord?.email, orderRecord?.customer?.email, addressMeta?.email, orderMeta?.email, fulMeta.email)

    const recipient = mapRecipientAddress(deliveryAddress, email, { defaultDistrict: this.defaultDistrict_ })
    for (const w of recipient.warnings) this.logger_.warn(`[carrier] Adres uyarısı: ${w}`)
    if (recipient.missing.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Kargo gönderisi için eksik adres alanları: ${recipient.missing.join(", ")}. Sipariş adresini admin panelden tamamlayıp tekrar deneyin.`
      )
    }

    const parcel = resolvePackage(this.buildPackageItems(items, order), this.packageProfile_)
    this.logger_.info(
      `[carrier] ${adapter.code} gönderi: ${reference} koli ${parcel.length}x${parcel.width}x${parcel.height} cm ${parcel.weight} kg ` +
        `(ağırlık: ${parcel.weightSource}, boyut: ${parcel.dimensionsSource}, ${parcel.totalUnits} adet)`
    )

    let result: { data: Partial<FulfillmentData> & Record<string, unknown>; labels: LabelRow[] }
    try {
      result = await adapter.createShipment({
        order: {
          id: String(order?.id ?? ""),
          displayId: order?.display_id ?? null,
          reference,
          isExchange,
          currencyCode: String(order?.currency_code ?? "try").toUpperCase(),
          total: order?.total != null ? Number(order.total) : null,
        },
        fulfillmentId: fulfillment?.id,
        recipient: recipient.value,
        parcel: { weight: parcel.weight, length: parcel.length, width: parcel.width, height: parcel.height },
        items: mapItems(this.buildLineItems(items, order)),
        testMode: carrierTestMode(),
      })
    } catch (error) {
      if (error instanceof MedusaError) throw error
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `${adapter.name} gönderisi oluşturulamadı: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    const data = mergeFulfillmentData(
      { carrier: adapter.code, carrier_name: adapter.name, order_reference: reference, test_mode: carrierTestMode() },
      result.data
    )
    const labels = (result.labels || []).filter((l) => l.tracking_number || l.tracking_url || l.label_url)
    if (!labels.length && typeof data.tracking_number === "string") {
      labels.push({
        tracking_number: data.tracking_number,
        tracking_url: (data.tracking_url as string) || adapter.trackingUrl(data.tracking_number),
        label_url: (data.label_url as string) || "",
      })
    }
    return { data, labels }
  }

  /** Medusa iptali engellenmez: adaptör iptali reddederse uyarı loglanır. */
  async cancelFulfillment(data: Record<string, unknown>): Promise<unknown> {
    const adapter = getCarrierFor(data)
    if (!adapter) return {}
    try {
      return await adapter.cancelShipment(data)
    } catch (error) {
      this.logger_.warn(
        `[carrier] ${adapter.code} gönderi iptali başarısız (${String(data?.shipment_ref ?? "?")}): ${String(error)}. Firmadan elle iptal gerekebilir.`
      )
      return {}
    }
  }

  async getFulfillmentDocuments(): Promise<never[]> {
    return []
  }
  async getShipmentDocuments(): Promise<never[]> {
    return []
  }
  async getReturnDocuments(): Promise<never[]> {
    return []
  }

  /** İade kargosu — adaptör `createReturn` sunuyorsa; yoksa iade kodu admin'den elle girilir. */
  async createReturnFulfillment(fulfillment: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    const incoming = (fulfillment?.data ?? {}) as Record<string, unknown>
    const adapter = getCarrierFor(incoming) ?? getConfiguredCarrier()
    if (!adapter?.createReturn) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Bu kargo firması için otomatik iade kaydı yok — iade kodunu sipariş sayfasındaki İade kutusundan elle gönderin."
      )
    }
    const returnId = String(incoming.return_id ?? "")
    const res = await adapter.createReturn(incoming, returnId)
    const data = mergeFulfillmentData(
      { ...incoming, carrier: adapter.code, carrier_name: adapter.name, is_return: true },
      { ...res.data, tracking_number: res.trackingNumber ?? undefined, tracking_url: res.trackingUrl ?? undefined, label_url: res.labelUrl ?? undefined, return_code: res.returnCode ?? undefined }
    )
    const labels: LabelRow[] = res.trackingNumber || res.labelUrl
      ? [{ tracking_number: res.trackingNumber || "", tracking_url: res.trackingUrl || "", label_url: res.labelUrl || "" }]
      : []
    return { data, labels }
  }

  private buildPackageItems(
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined
  ): PackageItemInput[] {
    const orderItems = order?.items ?? []
    const metadataByLineId = new Map<string, Record<string, unknown> | null>()
    for (const oi of orderItems) if (oi?.id) metadataByLineId.set(oi.id, oi.metadata ?? null)
    if (!items.length) {
      return orderItems.map((oi) => ({ quantity: Number(oi?.quantity ?? 1), metadata: oi?.metadata ?? null }))
    }
    return items.map((item) => ({
      quantity: Number(item?.quantity ?? 1),
      metadata: item?.line_item_id ? metadataByLineId.get(item.line_item_id) ?? null : null,
    }))
  }

  private buildLineItems(
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined
  ): MedusaLineItemLike[] {
    const orderItems = order?.items ?? []
    const byId = new Map(orderItems.filter((i) => i?.id).map((i) => [i.id, i]))
    if (!items.length) {
      return orderItems.map((item) => ({
        title: productTitle(item) || item?.title,
        variant_title: item?.variant_title,
        variant_sku: item?.variant_sku,
        quantity: Number(item?.quantity ?? 1),
        unit_price: Number(item?.unit_price ?? 0),
        metadata: item?.metadata ?? null,
      }))
    }
    return items.map((item) => {
      const oi = item?.line_item_id ? byId.get(item.line_item_id) : undefined
      return {
        // Fulfillment kaleminin title'ı varyant adıdır → ürün adı siparişten.
        title: productTitle(oi) || item?.title || oi?.title,
        variant_title: oi?.variant_title,
        variant_sku: item?.sku ?? oi?.variant_sku,
        quantity: Number(item?.quantity ?? 1),
        unit_price: oi?.unit_price ? Number(oi.unit_price) : null,
        metadata: oi?.metadata ?? null,
      }
    })
  }
}

function productTitle(item: unknown): string | undefined {
  const value = (item as { product_title?: unknown } | null | undefined)?.product_title
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export type { CarrierAdapter }
export default CarrierFulfillmentProviderService
