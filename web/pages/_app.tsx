import 'tailwindcss/tailwind.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { usePreserveScroll } from '../hooks/use-preserve-scroll'

function MyApp({ Component, pageProps }: AppProps) {
  usePreserveScroll()

  return (
    <>
      <Head>
        <title>Manifold Markets — A market for every question</title>

        <meta
          property="og:title"
          name="twitter:title"
          content="Manifold Markets — A market for every question"
          key="title"
        />
        <meta
          name="description"
          content="Manifold Markets lets you create a market on any question. Sign up in 30 seconds and start trading on politics, sports, or anything that interests you."
          key="description1"
        />
        <meta
          property="og:description"
          name="twitter:description"
          content="Manifold Markets lets you create a market on any question. Sign up in 30 seconds and start trading on politics, sports, or anything that interests you."
          key="description2"
        />
        <meta property="og:url" content="https://manifold.markets" key="url" />
        <meta name="twitter:card" content="summary" key="card" />
        <meta name="twitter:site" content="@manifoldmarkets" />
        <meta
          property="og:image"
          content="https://manifold.markets/logo-cover.png"
          key="image1"
        />
        <meta
          name="twitter:image"
          content="https://manifold.markets/logo-bg-white.png"
          key="image2"
        />
      </Head>

      <Component {...pageProps} />
    </>
  )
}

export default MyApp
