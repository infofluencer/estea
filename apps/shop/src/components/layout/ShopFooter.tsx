import Image from 'next/image'

export default function ShopFooter() {
  return (
    <footer className="border-t border-ink/10 bg-white px-5 py-10 text-center sm:px-8">
      <Image
        src="/logo.png"
        alt="Esçay"
        width={140}
        height={75}
        className="mx-auto h-10 w-auto opacity-80"
      />
      <p className="mt-4 text-xs tracking-wide text-ink/45">
        © {new Date().getFullYear()} Esçay · Sunum mağaza arayüzü
      </p>
    </footer>
  )
}
