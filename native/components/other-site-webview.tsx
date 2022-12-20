import WebView from 'react-native-webview'
import { View } from 'react-native'
export const OtherSiteWebview = (props: {
  url: string | undefined
  height: number
}) => {
  const { url, height } = props

  return (
    <View
      style={{
        display: url ? 'flex' : 'none',
        height,
      }}
    >
      <WebView
        style={{
          display: url ? 'flex' : 'none',
          height,
        }}
        source={{
          uri: url ? url : 'about:blank',
        }}
      />
    </View>
  )
}
