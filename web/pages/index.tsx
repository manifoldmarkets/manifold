import type { NextPage } from 'next'
import Head from 'next/head'
import React from 'react'
import { Hero } from '../components/hero'

const Home: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Mantic Markets</title>

        <meta property="og:title" name="twitter:title" content="Mantic Markets" />
        <meta name="description" content="Decentralized user-created prediction markets on Solana" />
        <meta property="og:description" name="twitter:description" content="Decentralized user-created prediction markets on Solana" />
        <meta property="og:url" content="https://mantic.markets" />
        <meta property="og:image" name="twitter:image" content="https://mantic.markets/logo-cover.png" />

        <link rel="icon" href="/favicon.ico" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="true"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Major+Mono+Display&display=swap"
          rel="stylesheet"
        />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-SSFK1Q138D"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push(['js', new Date()]);
          window.dataLayer.push(['config', 'G-SSFK1Q138D']);
        </script>
      </Head>

      <Hero />
    </div>
  )
}

export default Home
