import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import ShopLayout from './pages/ShopLayout'
import ShopProductsPage from './components/shop/ShopProductsPage'
import ProductDetailPage from './components/shop/ProductDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/urunler" element={<ShopLayout />}>
          <Route index element={<ShopProductsPage />} />
          <Route path=":id" element={<ProductDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
