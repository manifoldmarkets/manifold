import { Contract } from 'common/contract'
import { FeedCard } from 'components/contract/FeedCard'
import Page from 'components/Page'
import { ThemedText } from 'components/ThemedText'
import { ThemedView } from 'components/ThemedView'
import { EXAMPLE_CONTRACTS } from 'constants/ExampleContracts'
import { useColor } from 'hooks/useColor'
import { Platform, StyleSheet, View } from 'react-native'

export default function HomeScreen() {
  const color = useColor()
  return (
    <Page>
      {EXAMPLE_CONTRACTS.map((contract, index) => (
        <FeedCard key={index} contract={contract as Contract} />
      ))}
    </Page>
  )
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
})
