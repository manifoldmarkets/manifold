import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html data-theme="mantic" className="min-h-screen">
      <Head>
        <title>Mantic Markets</title>

        <meta
          property="og:title"
          name="twitter:title"
          content="Mantic Markets"
        />
        <meta
          name="description"
          content="Decentralized user-created prediction markets on Solana"
        />
        <meta
          property="og:description"
          name="twitter:description"
          content="Decentralized user-created prediction markets on Solana"
        />
        <meta property="og:url" content="https://mantic.markets" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@manticmarkets" />
        <meta
          property="og:image"
          name="twitter:image"
          content="https://mantic.markets/logo-cover.png"
        />

        <link rel="icon" href="/favicon.ico" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="true"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Major+Mono+Display&family=Readex+Pro:wght@400;700&display=swap"
          rel="stylesheet"
        />

        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-SSFK1Q138D"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-SSFK1Q138D');
          `,
          }}
        />
      </Head>
      <body className="min-h-screen font-readex-pro bg-base-200">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
