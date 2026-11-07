/**
 * Kayıtlı taşıyıcı adaptörleri — `SHIPPING_CARRIER=<kod>` ile seçilir.
 * Boşsa kargo elle yürür (manual_manual + admin "Kargoya ver (takip no)").
 *
 *   dhl → DHL eCommerce Türkiye (Apizone), adapters/dhl
 */
import { registerCarrierAdapter } from "../registry"
import { dhlAdapter } from "./dhl"

registerCarrierAdapter(dhlAdapter)
