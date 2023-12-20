import Script from 'next/script'
import { AuthProvider } from 'web/components/auth-context'
import '../styles/globals.css'
import { Major_Mono_Display, Figtree } from 'next/font/google'
import clsx from 'clsx'
import { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { authenticateOnServer } from 'web/lib/firebase/server-auth'
import { getUserAndPrivateUser } from 'web/lib/firebase/users'
import { AUTH_COOKIE_NAME } from 'common/envs/constants'

// See https://nextjs.org/docs/basic-features/font-optimization#google-fonts
// and if you add a font, you must add it to tailwind config as well for it to work.

const logoFont = Major_Mono_Display({
  weight: ['400'],
  variable: '--font-logo',
  subsets: ['latin'],
})

const mainFont = Figtree({
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-main',
  subsets: ['latin'],
})
const title = 'Manifold | The largest prediction market platform'
const description =
  'Manifold is the largest prediction market platform. Bet on news, politics, science, AI, and more with play-money. Accurate forecasts via the wisdom of the crowd.'
const ogImageUrl = '/logo.png'
const url = 'https://manifold.markets/'
export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  openGraph: {
    locale: 'en_US',
    siteName: 'Manifold Markets',
    url,
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'Manifold Markets',
      },
    ],
  },
  twitter: {
    site: '@manifoldmarkets',
    description,
    title,
    card: 'summary',
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'Manifold Markets',
      },
    ],
  },
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

// Only renders once per session
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const user = cookieStore.has(AUTH_COOKIE_NAME)
    ? cookieStore.get(AUTH_COOKIE_NAME)
    : null
  const serverUser = await authenticateOnServer(user?.value)
  const users = serverUser ? await getUserAndPrivateUser(serverUser.uid) : null
  const authUser = users ? { ...users, authLoaded: true } : null
  return (
    <html>
      <body
        className={clsx(
          'font-figtree contents font-normal',
          logoFont.variable,
          mainFont.variable
        )}
      >
        <AuthProvider serverUser={authUser}>
          <div className={'bg-canvas-50 text-ink-1000'}>{children}</div>
        </AuthProvider>
        {/* Workaround for https://github.com/tailwindlabs/headlessui/discussions/666, to allow font CSS variable */}
        <div id="headlessui-portal-root">
          <div />
        </div>
      </body>
      {/* Umami, for pageview analytics. Separate from Main Manifold umami */}
      <Script
        src="https://analytics.eu.umami.is/script.js"
        data-website-id="38ac9f34-f8f0-49b7-ba3e-e335125a8b59"
      />
      {/* Hotjar, for recording user sessions */}
      <Script
        id="hotjar"
        dangerouslySetInnerHTML={{
          __html: `
    (function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:2968940,hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
        a.appendChild(r);
    })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`,
        }}
      />
      <Script
        id="fbpx"
        dangerouslySetInnerHTML={{
          __html: `
          !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '254770557407697');
  fbq('track', 'PageView');`,
        }}
      />
      {/* POLITICS TODO: Reenable one tap setup */}
      {/* <GoogleOneTapSetup /> */}
    </html>
  )
}
