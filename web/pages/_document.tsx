import { Html, Head, Main, NextScript } from 'next/document'
import { BACKGROUND_COLOR, ENV_CONFIG } from 'common/envs/constants'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href={ENV_CONFIG.faviconPath} />
      </Head>
      <body className={BACKGROUND_COLOR}>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
