import { IconPackage, IconShieldCheck } from "./cart-icons"

const BENEFITS = [
  {
    icon: IconPackage,
    title: "Taze ve Özenli Paketleme",
    description:
      "Çayınız aromasını koruyan ambalajda, özenle hazırlanarak gönderilir.",
  },
  {
    icon: IconShieldCheck,
    title: "Güvenli Alışveriş",
    description:
      "Ödeme bilgileriniz güvenli ödeme altyapısı üzerinden işlenir.",
  },
] as const

export function CartInfoAside() {
  return (
    <aside className="cart-privileges">
      <div className="cart-privileges__panel">
        <h2 className="cart-privileges__title">Es Çay güvencesi</h2>

        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon
          return (
            <div key={benefit.title} className="cart-privileges__item">
              <div className="cart-privileges__benefit">
                <div className="cart-privileges__icon-wrap">
                  <Icon className="cart-privileges__icon" />
                </div>
                <div className="cart-privileges__content">
                  <h3 className="cart-privileges__benefit-title">
                    {benefit.title}
                  </h3>
                  <p className="cart-privileges__benefit-text">
                    {benefit.description}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
