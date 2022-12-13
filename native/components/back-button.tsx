import WebView from 'react-native-webview'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import { AntDesign } from '@expo/vector-icons'
import { RefObject } from 'react'
import { NavigationState } from 'App'
import { Text } from 'components/Text'
const BACK_HEIGHT = 40

export const BackButton = (props: {
  webView: RefObject<WebView | undefined>
  navState: NavigationState
}) => {
  const { webView, navState } = props
  const { canGoBack, isOnContractPage } = navState
  const shouldShow = canGoBack && isOnContractPage
  const goBack = () => {
    if (webView.current && canGoBack) {
      webView.current.goBack()
    }
  }

  const styles = StyleSheet.create({
    container: {
      display: shouldShow ? 'flex' : 'none',
      top: 0,
      position: 'relative',
      height: BACK_HEIGHT,
      maxHeight: BACK_HEIGHT,
      paddingBottom: 0,
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingLeft: 7,
    },
    backRowItem: {
      color: '#4338ca',
      marginLeft: 7,
    },
  })

  return (
    <>
      {shouldShow ? (
        <TouchableOpacity style={styles.container} onPress={goBack}>
          <AntDesign name="arrowleft" size={24} style={styles.backRowItem} />
          <Text style={styles.backRowItem}>Back</Text>
        </TouchableOpacity>
      ) : (
        <View />
      )}
    </>
  )
}
