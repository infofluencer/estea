import { ContactForm } from "./ContactForm"

export const metadata = {
  title: "İletişim | Es Çay",
}

export default function ContactPage() {
  return (
    <div className="page-shell">
      <ContactForm />
    </div>
  )
}
