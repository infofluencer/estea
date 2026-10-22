import ParasutModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const PARASUT_MODULE = "parasut"

export {
  isMockMode,
  isPlaceholderCredential,
  isParasutDryRun,
  assertParasutDryRunEnabled,
  shouldRetryParasutInvoice,
  parseDryRunFlag,
  normalizeOptions,
  toParasutCurrency,
  PARASUT_DEFAULT_BASE_URL,
  PARASUT_DEFAULT_OAUTH_URL,
} from "./options"
export { ParasutClient, ParasutError, formatParasutErrorBody } from "./client"
export type { ParasutMockBehavior, ParasutTransport } from "./client"
export {
  mockEnsureContact,
  mockCreateSalesInvoice,
  mockFinalizeInvoice,
  mockGetInvoicePdf,
  mockCancelInvoice,
  mockCreateRefundInvoice,
  resolveMockInvoiceType,
} from "./mock"
export {
  buildSalesInvoicePayload,
  estimatePayloadNetTotal,
} from "./payload"
export type {
  ParasutSalesInvoicePayload,
  ParasutSalesInvoiceDetail,
} from "./payload"
export type {
  ParasutOrderInvoiceMeta,
  ParasutRefundInvoiceMeta,
  ParasutInvoiceType,
  ParasutInvoiceStatus,
  ParasutConnectionStatus,
} from "./types"

export default Module(PARASUT_MODULE, {
  service: ParasutModuleService,
})
