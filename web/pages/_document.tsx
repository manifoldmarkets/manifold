import { Html, Head, Main, NextScript } from 'next/document'
import { ENV_CONFIG } from 'common/envs/constants'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href={ENV_CONFIG.faviconPath} />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Major+Mono+Display&family=Readex+Pro:wght@300;400;600;700&display=swap"
          rel="stylesheet"
          crossOrigin="anonymous"
        />
      </Head>
      <body className="font-readex-pro bg-gray-50">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
