import Navbar from './components/Navbar'
import VideoShowcase from './components/VideoShowcase'
import ProductShowcase from './components/ProductShowcase'

export default function App() {
  return (
    <>
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-sm focus:bg-cream focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        İçeriğe geç
      </a>
      <Navbar />
      <main id="icerik">
        <VideoShowcase />
        <ProductShowcase />
      </main>
    </>
  )
}
