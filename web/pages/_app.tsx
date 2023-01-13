import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import Head from 'next/head'
import { QueryClient, QueryClientProvider } from 'react-query'
import { AuthProvider, AuthUser } from 'web/components/auth-context'
import Welcome from 'web/components/onboarding/welcome'
import { NativeMessageListener } from 'web/components/native-message-listener'
import { Analytics } from '@vercel/analytics/react'
import '../styles/globals.css'
import { useHasLoaded } from 'web/hooks/use-has-loaded'
import { SearchProvider } from 'web/components/search/search-context'

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

// specially treated props that may be present in the server/static props
type ManifoldPageProps = { auth?: AuthUser }

function MyApp({ Component, pageProps }: AppProps<ManifoldPageProps>) {
  useEffect(printBuildInfo, [])
  useHasLoaded()

  return (
    <>
      <Head>
        <title>{'Manifold Markets — A market for every question'}</title>

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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-itunes-app" content="app-id=6444136749" />

        <link rel="manifest" href="manifest.json" />
      </Head>
      <AuthProvider serverUser={pageProps.auth}>
        <NativeMessageListener />
        <QueryClientProvider client={queryClient}>
          <SearchProvider>
            <Welcome />
            <Component {...pageProps} />
          </SearchProvider>
        </QueryClientProvider>
      </AuthProvider>
      <Analytics />
    </>
  )
}

const queryClient = new QueryClient()

export default MyApp
