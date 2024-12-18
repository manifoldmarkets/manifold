import { Row } from 'components/layout/row'
import { BinaryProbability } from '../Probability'
import { BinaryContract } from 'common/contract'
import { ThemedText } from 'components/ThemedText'
import { useTokenMode } from 'hooks/useTokenMode'
import { EXAMPLE_POINTS } from 'constants/examples/ExampleData'
import { BinaryGraph } from '../graph/BinaryGraph'
import { Col } from 'components/layout/col'

export function BinaryOverview({ contract }: { contract: BinaryContract }) {
  const data = EXAMPLE_POINTS[contract.id as keyof typeof EXAMPLE_POINTS]

  if (!data) return null
  const { cash: cashBetData, play: playBetData } = data

  const { mode } = useTokenMode()
  const { betPoints } = mode === 'sweep' ? cashBetData : playBetData

  return (
    <Col style={{ gap: 8 }}>
      <Row
        style={{
          alignItems: 'center',
          gap: 8,
        }}
      >
        <BinaryProbability contract={contract} size="3xl" />
        <ThemedText size="xl">chance</ThemedText>
      </Row>

      <BinaryGraph betPoints={betPoints} contract={contract} />
    </Col>
  )
}
