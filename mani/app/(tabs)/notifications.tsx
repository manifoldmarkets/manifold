import Page from 'components/Page'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'
import { StyleSheet } from 'react-native'

export default function TabTwoScreen() {
  const color = useColor()
  return (
    <Page>
      <ThemedText>notifications</ThemedText>
    </Page>
  )
}
