import { Html, Head, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
  return (
    <Html lang="en" className="font-figtree font-normal">
      {/* Prevent flash of light theme before stylesheet loads. See use-theme.ts */}
      <style>
        {`@media (prefers-color-scheme: dark) {
            :root {
              color-scheme: dark;
              background-color: rgb(15 23 41);
              color: white;
            }
          }`}
      </style>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/sumcoin-logo.png" />
        <Script src="/init-theme.js" strategy="beforeInteractive" />
      </Head>
      <body className="bg-canvas-0 text-ink-1000">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
