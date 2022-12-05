import WebView from 'react-native-webview'
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native'
import { AntDesign } from '@expo/vector-icons'
export const BackButton = (props: {
  webView: React.RefObject<WebView | undefined>
  canGoBack: boolean
}) => {
  const { webView, canGoBack } = props

  const goBack = () => {
    if (webView.current && canGoBack) {
      webView.current.goBack()
    }
  }

  const styles = StyleSheet.create({
    container: {
      display: canGoBack ? 'flex' : 'none',
      flex: 1,
      justifyContent: 'flex-start',
      height: 50,
    },
  })
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={goBack}>
        <View>
          <AntDesign name="arrowleft" size={24} color="black" />
          <Text>Back</Text>
        </View>
      </TouchableOpacity>
    </View>
  )
}
