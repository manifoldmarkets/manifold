import Page from 'components/page'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { StyleSheet } from 'react-native'

export default function TabTwoScreen() {
  const color = useColor()
  return (
    <Page>
      <ThemedText>live</ThemedText>
    </Page>
  )
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
})
