import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { escapeHtml } from "../../../emails/format"
import { createNotificationIdempotent } from "../../../lib/notify"

type ContactBody = {
  name: string
  email: string
  subject: string
  message: string
  company?: string
}

const INBOX = process.env.CONTACT_INBOX || "info@esteacay.com"

/**
 * Storefront contact form → SMTP via notification module.
 * No DB entity. Honeypot field `company` must be empty.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const body = (req.validatedBody || req.body) as ContactBody

  if (body.company && String(body.company).trim()) {
    res.status(200).json({ ok: true })
    return
  }

  const name = String(body.name || "").trim()
  const email = String(body.email || "").trim()
  const subject = String(body.subject || "").trim()
  const message = String(body.message || "").trim()

  if (
    name.length < 2 ||
    !email.includes("@") ||
    subject.length < 2 ||
    message.length < 10
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid contact payload"
    )
  }

  const notificationService = req.scope.resolve(Modules.NOTIFICATION)
  const safeSubject = subject.slice(0, 120)
  const html = `
    <p><strong>Ad:</strong> ${escapeHtml(name)}</p>
    <p><strong>E-posta:</strong> ${escapeHtml(email)}</p>
    <p><strong>Konu:</strong> ${escapeHtml(safeSubject)}</p>
    <p><strong>Mesaj:</strong></p>
    <p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>
  `
  const text = `Ad: ${name}\nE-posta: ${email}\nKonu: ${safeSubject}\n\n${message}`

  await createNotificationIdempotent(notificationService, {
    to: INBOX,
    channel: "email",
    template: "contact-form",
    content: {
      subject: `[Es Çay İletişim] ${safeSubject}`,
      html,
      text,
    },
  })

  res.status(200).json({ ok: true })
}
