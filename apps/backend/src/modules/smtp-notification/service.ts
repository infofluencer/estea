import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  NotificationTypes,
} from "@medusajs/framework/types"
import nodemailer, { type Transporter } from "nodemailer"

export type SmtpNotificationOptions = {
  host?: string
  port?: number
  user?: string
  pass?: string
  from?: string
  secure?: boolean
  channels?: string[]
}

type InjectedDependencies = {
  logger: Logger
}

/**
 * Generic SMTP notification provider (nodemailer).
 * Works with Google Workspace, Mailpit, or any SMTP server — config via env only.
 */
class SmtpNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "smtp"

  protected logger_: Logger
  protected options_: SmtpNotificationOptions
  protected transporter_: Transporter | null = null

  constructor(
    { logger }: InjectedDependencies,
    options: SmtpNotificationOptions
  ) {
    super()
    this.logger_ = logger
    this.options_ = options
    this.initTransporter()
  }

  static validateOptions(options: Record<string, unknown>) {
    const required = ["host", "port", "from"] as const
    for (const key of required) {
      if (!options[key]) {
        console.warn(
          `[smtp] Missing option "${key}". Set SMTP_* env vars before sending email.`
        )
      }
    }
  }

  protected initTransporter() {
    const { host, port, user, pass, secure } = this.options_

    if (!host || !port) {
      this.logger_.warn(
        "[smtp] SMTP host/port not configured — emails will fail until .env is set."
      )
      return
    }

    this.transporter_ = nodemailer.createTransport({
      host,
      port,
      secure: secure ?? false,
      auth:
        user && pass
          ? { user, pass }
          : user
            ? { user, pass: pass ?? "" }
            : undefined,
    })
  }

  async send(
    notification: NotificationTypes.ProviderSendNotificationDTO
  ): Promise<NotificationTypes.ProviderSendNotificationResultsDTO> {
    if (!notification) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No notification information provided"
      )
    }

    if (!this.transporter_) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "SMTP transporter is not configured"
      )
    }

    const from = notification.from?.trim() || this.options_.from
    if (!from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No sender (from) address configured"
      )
    }

    const subject =
      notification.content?.subject ??
      (typeof notification.data?.subject === "string"
        ? notification.data.subject
        : "Es Çay Bildirimi")

    const html = notification.content?.html
    const text = notification.content?.text

    if (!html && !text) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Notification must include html or text content"
      )
    }

    try {
      const result = await this.transporter_.sendMail({
        from,
        to: notification.to,
        subject,
        html: html ?? undefined,
        text: text ?? undefined,
      })

      this.logger_.info(
        `[smtp] Sent email to ${notification.to} (template: ${notification.template}, messageId: ${result.messageId})`
      )

      return { id: result.messageId }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown SMTP error"
      this.logger_.error(`[smtp] Failed to send email to ${notification.to}: ${message}`)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to send email: ${message}`
      )
    }
  }
}

export default SmtpNotificationProviderService
