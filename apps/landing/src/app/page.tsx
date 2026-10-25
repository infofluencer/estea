import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SkipLink from '@/components/layout/SkipLink'
import RevealInit from '@/components/ui/RevealInit'
import LeafCursor from '@/components/ui/LeafCursor'
import Hero from '@/components/sections/Hero'
import Manifesto from '@/components/sections/Manifesto'
import Collection from '@/components/sections/Collection'
import Journey from '@/components/sections/Journey'
import Faq from '@/components/sections/Faq'
import Blog from '@/components/sections/Blog'
import SectionRule from '@/components/ui/SectionRule'

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
        <SectionRule />
        <Faq />
        <Blog />
      </main>
      <Footer />
      <RevealInit />
      <LeafCursor />
    </>
  )
}
