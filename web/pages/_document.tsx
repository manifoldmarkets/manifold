import { Html, Head, Main, NextScript } from 'next/document'
import { ENV_CONFIG } from 'common/envs/constants'

export default function Document() {
  return (
    <Html data-theme="mantic" className="min-h-screen">
      <Head>
        <link rel="icon" href={ENV_CONFIG.faviconPath} />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="true"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Major+Mono+Display&family=Readex+Pro:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/instantsearch.css@7.4.5/themes/satellite-min.css"
          integrity="sha256-TehzF/2QvNKhGQrrNpoOb2Ck4iGZ1J/DI4pkd2oUsBc="
          crossOrigin="anonymous"
        />
      </Head>

      <body className="font-readex-pro bg-base-200 dark:bg-gray-800 min-h-screen text-gray-800 dark:text-gray-200">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
