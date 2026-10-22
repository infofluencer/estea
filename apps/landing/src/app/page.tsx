import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import Hero from '@/components/sections/Hero'
import Manifesto from '@/components/sections/Manifesto'
import Collection from '@/components/sections/Collection'
import Journey from '@/components/sections/Journey'
import History from '@/components/sections/History'
import Blog from '@/components/sections/Blog'
import Contact from '@/components/sections/Contact'

export default function LandingPage() {
  return (
    <>
      <SkipLink />
      <Navbar />
      <main id="icerik">
        <Hero />
        <Manifesto />
        <Collection />
        <Journey />
        <History />
        <Blog />
        <Contact />
      </main>
      <Footer />
      <RevealInit />
      <LeafCursor />
    </>
  )
}
