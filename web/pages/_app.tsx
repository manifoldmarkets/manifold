import 'tailwindcss/tailwind.css'
import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import { usePreserveScroll } from 'web/hooks/use-preserve-scroll'
import { QueryClient, QueryClientProvider } from 'react-query'
import {
  createIframe,
  defaultRenderers,
  iframeRenderer,
  initPreviews,
} from 'link-summoner'

function firstLine(msg: string) {
  return msg.replace(/\r?\n.*/s, '')
}

function printBuildInfo() {
  // These are undefined if e.g. dev server
  if (process.env.NEXT_PUBLIC_VERCEL_ENV) {
    const env = process.env.NEXT_PUBLIC_VERCEL_ENV
    const msg = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE
    const owner = process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER
    const repo = process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
    const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
    const url = `https://github.com/${owner}/${repo}/commit/${sha}`
    console.info(`Build: ${env} / ${firstLine(msg || '???')} / ${url}`)
  }
}

const domain = 'localhost:3000'

/**
 * Example:
 * https://manifold.markets/SG/will-elon-musk-buy-twitter-this-yea
 * -> https://manifold.markets/embed/SG/will-elon-musk-buy-twitter-this-yea
 */
function rewriteToEmbed(link: string) {
  const alreadyEmbed = link.includes(`localhost:3000/embed/`)
  if (alreadyEmbed) return link

  const match = link.match(regex)!

  console.log(
    'Hello world',
    `http://localhost:3000/embed/${match[1]}/${match[2]}`
  )

  return `http://localhost:3000/embed/${match[1]}/${match[2]}`
}
// Only rewrite market links in regex
const regex = /^https?:\/\/localhost\:3000\/(?!charity\/)([^\/]+)\/([^\/]+)/

if (typeof document !== 'undefined') {
  // Seems to be undefined; because of https://i.imgur.com/4bMQ8rA.png ?
  console.log('initPreviews', initPreviews)
  initPreviews({
    renderers: [
      // Just for localhost markets
      {
        canRender: async (url: URL) => regex.test(url.href),

        render: async (url: URL) =>
          createIframe(rewriteToEmbed(url.href), 'manifold-preview'),
      },
      // All localhost URLs
      iframeRenderer(/localhost\:3000/),
      ...defaultRenderers,
    ],
  })
}

function MyApp({ Component, pageProps }: AppProps) {
  usePreserveScroll()

  useEffect(printBuildInfo, [])

  return (
    <>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-SSFK1Q138D" />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-SSFK1Q138D');
        `}
      </Script>
      {/* Hotjar Tracking Code for https://manifold.markets */}
      <Script id="hotjar">
        {`
          (function(h,o,t,j,a,r){
            h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
            h._hjSettings={hjid:2968940,hjsv:6};
            a=o.getElementsByTagName('head')[0];
            r=o.createElement('script');r.async=1;
            r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
            a.appendChild(r);
          })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
        `}
      </Script>
      <Head>
        <title>Manifold Markets — A market for every question</title>

        <meta
          property="og:title"
          name="twitter:title"
          content="Manifold Markets — A market for every question"
          key="title"
        />
        <meta
          name="description"
          content="Manifold Markets lets you create a market on any question. Sign up in 30 seconds and start trading on politics, sports, or anything that interests you."
          key="description1"
        />
        <meta
          property="og:description"
          name="twitter:description"
          content="Manifold Markets lets you create a market on any question. Sign up in 30 seconds and start trading on politics, sports, or anything that interests you."
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
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </Head>

      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </>
  )
}

const queryClient = new QueryClient()

export default MyApp
