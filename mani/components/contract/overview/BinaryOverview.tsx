import { Row } from 'components/layout/row'
import { BinaryProbability } from '../Probability'
import { BinaryContract } from 'common/contract'
import { ThemedText } from 'components/ThemedText'
import { useTokenMode } from 'hooks/useTokenMode'
import { EXAMPLE_POINTS } from 'constants/examples/ExampleData'
import { View } from 'react-native'
import { BinaryGraph } from '../graph/BinaryGraph'

export function BinaryOverview({ contract }: { contract: BinaryContract }) {
  const data = EXAMPLE_POINTS[contract.id as keyof typeof EXAMPLE_POINTS]
  if (!data) return null
  const { cash: cashBetData, play: playBetData } = data

  const { mode } = useTokenMode()
  const { betPoints } = mode === 'sweep' ? cashBetData : playBetData

  return (
    <View>
      <Row
        style={{
          alignItems: 'center',
          gap: 8,
        }}
      >
        <BinaryProbability contract={contract} size="3xl" />
        <ThemedText size="xl">chance</ThemedText>
      </Row>

      <BinaryGraph betPoints={betPoints} />
    </View>
  )
}
