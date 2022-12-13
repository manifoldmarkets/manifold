import WebView from 'react-native-webview'
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  NativeScrollEvent,
} from 'react-native'
import { AntDesign } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { NavigationState } from 'App'
export const BackButton = (props: {
  webView: React.RefObject<WebView | undefined>
  navState: NavigationState
}) => {
  const { webView, navState } = props
  const { canGoBack, scrollEvent, isOnContractPage } = navState
  const [revealBackHeight, setRevealBackHeight] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [scrollDirection, setScrollDirection] = useState<'down' | 'up'>('down')
  const shouldShow = canGoBack && isOnContractPage
  const goBack = () => {
    if (webView.current && canGoBack) {
      webView.current.goBack()
    }
  }
  const handleScroll = (e: NativeScrollEvent) => {
    const { contentOffset, contentSize, layoutMeasurement } = e
    const contentHeight = contentSize.height - layoutMeasurement.height
    const { y } = contentOffset
    const newHeight =
      revealBackHeight >= 30 ? 30 : revealBackHeight <= 0 ? 0 : revealBackHeight
    if (y < 0 || y > contentHeight) return
    // scrolling up
    if (y < scrollOffset) {
      // switched directions from down to up
      if (scrollDirection === 'down') {
        setRevealBackHeight(0)
      }
      const delta = scrollOffset - y
      setRevealBackHeight(newHeight + delta)
      setScrollDirection('up')
    }
    // scrolling down
    else {
      const delta = y - scrollOffset
      setRevealBackHeight(newHeight - delta)
      setScrollDirection('down')
    }

    // console.log('back height', revealBackHeight)

    setScrollOffset(y)
  }

  useEffect(() => {
    if (scrollEvent) handleScroll(scrollEvent)
  }, [scrollEvent])

  const styles = StyleSheet.create({
    container: {
      display: shouldShow ? 'flex' : 'none',
      maxHeight:
        revealBackHeight > 30
          ? 30
          : revealBackHeight < 0
          ? 0
          : revealBackHeight,
      paddingBottom: 0,
      alignItems: 'center',
      color: 'blue',
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingLeft: 10,
    },
  })

  return (
    <>
      {shouldShow ? (
        <TouchableOpacity style={styles.container} onPress={goBack}>
          <AntDesign name="arrowleft" size={24} color="blue" />
          <Text style={{ color: 'blue' }}>Back</Text>
        </TouchableOpacity>
      ) : (
        <View />
      )}
    </>
  )
}
