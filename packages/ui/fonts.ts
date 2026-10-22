import { Archivo, Bricolage_Grotesque } from 'next/font/google'

const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-archivo',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-bricolage',
  display: 'swap',
})

/** Apply on <html> so the theme's font tokens resolve. */
export const fontVariables = `${archivo.variable} ${bricolage.variable}`
