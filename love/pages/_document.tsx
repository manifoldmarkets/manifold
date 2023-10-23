import { Html, Head, Main, NextScript } from 'next/document'
import { ENV_CONFIG } from 'common/envs/constants'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href={ENV_CONFIG.faviconPath} />
      </Head>
      <body className="bg-canvas-50 text-ink-1000">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
