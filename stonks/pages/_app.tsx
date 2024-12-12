import { Inter, Roboto_Mono } from '@next/font/google'
import '../styles/globals.css'
import type { AppProps } from 'next/app'
import clsx from 'clsx'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-inter',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-roboto-mono',
})

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <main className={clsx(robotoMono.variable, inter.variable)}>
      <div className="h-full w-full font-sans">
        <Component {...pageProps} />
      </div>
    </main>
  )
}

export default MyApp
