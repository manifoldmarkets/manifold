import { Html, Head, Main, NextScript } from 'next/document'
import { ENV_CONFIG } from 'common/envs/constants'

export default function Document() {
  return (
    <Html lang="en" data-theme="mantic" className="min-h-screen">
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
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/instantsearch.css@7.4.5/themes/satellite-min.css"
          integrity="sha256-TehzF/2QvNKhGQrrNpoOb2Ck4iGZ1J/DI4pkd2oUsBc="
          crossOrigin="anonymous"
        />
      </Head>
      <body className="font-readex-pro bg-greyscale-1 min-h-screen">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
