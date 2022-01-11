import 'tailwindcss/tailwind.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Manifold Markets</title>

        <meta
          property="og:title"
          name="twitter:title"
          content="Manifold Markets"
          key="title"
        />
        <meta
          name="description"
          content="Manifold Markets is creating better forecasting through user-created prediction markets."
          key="description1"
        />
        <meta
          property="og:description"
          name="twitter:description"
          content="Manifold Markets is creating better forecasting through user-created prediction markets."
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
