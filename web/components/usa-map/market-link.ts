import { useContext } from 'react'

import { NativeContext } from 'web/components/native-message-provider'

// Links from the map to a Manifold market page. On the web they open in a new
// tab so the map keeps its place. The iOS and Android apps are a WebView that
// drops new-window requests for Manifold URLs (native/App.tsx's
// handleExternalLink only opens external ones), so a new-tab link there does
// nothing at all; in the app the link opens in the same view instead.
// Reads the context directly so a render outside the provider counts as web.
export function useMarketLink(): {
  newTab: boolean
  linkProps: { target?: '_blank'; rel?: string }
} {
  const isNative = useContext(NativeContext)?.isNative ?? false
  return isNative
    ? { newTab: false, linkProps: {} }
    : {
        newTab: true,
        linkProps: { target: '_blank', rel: 'noopener noreferrer' },
      }
}
