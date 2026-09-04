import { Outlet } from 'react-router-dom'
import ShopHeader from '../components/shop/ShopHeader'
import { ShopBagProvider } from '../components/shop/ShopBagContext'

export default function ShopLayout() {
  return (
    <ShopBagProvider>
      <div className="min-h-screen bg-white">
        <ShopHeader />
        <main>
          <Outlet />
        </main>
        <footer className="border-t border-ink/10 bg-white px-5 py-10 text-center sm:px-8">
          <img src="/logo.png" alt="Es tea Çay" className="mx-auto h-10 w-auto opacity-80" />
          <p className="mt-4 text-xs tracking-wide text-ink/45">
            © {new Date().getFullYear()} Es Çay · Sunum mağaza arayüzü
          </p>
        </footer>
      </div>
    </ShopBagProvider>
  )
}
