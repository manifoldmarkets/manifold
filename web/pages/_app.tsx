import 'tailwindcss/tailwind.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Mantic Markets</title>

        <meta
          property="og:title"
          name="twitter:title"
          content="Mantic Markets"
          key="title"
        />
        <meta
          name="description"
          content="Mantic Markets is creating better forecasting through user-created prediction markets."
          key="description1"
        />
        <meta
          property="og:description"
          name="twitter:description"
          content="Mantic Markets is creating better forecasting through user-created prediction markets."
          key="description2"
        />
        <meta property="og:url" content="https://mantic.markets" key="url" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@manticmarkets" />
        <meta
          property="og:image"
          name="twitter:image"
          content="https://mantic.markets/logo-cover.png"
        />
      </Head>

      <Component {...pageProps} />
    </>
  )
}

export default MyApp
