import WebView from 'react-native-webview'
import React, { forwardRef } from 'react'
export const OtherSiteWebview = forwardRef(function OtherSiteWebview(props: {
  url: string | undefined
}) {
  const { url } = props
  return (
    <WebView
      style={{
        display: url ? 'flex' : 'none',
        height: '100vh',
        flex: 1,
      }}
      source={{
        uri: url ? url : 'about:blank',
      }}
    />
  )
})
