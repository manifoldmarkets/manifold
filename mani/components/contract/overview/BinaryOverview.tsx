import { Row } from 'components/layout/row'
import { BinaryProbability } from '../Probability'
import { BinaryContract } from 'common/contract'
import { ThemedText } from 'components/ThemedText'
import { useTokenMode } from 'hooks/useTokenMode'
import { EXAMPLE_POINTS } from 'constants/examples/ExampleData'
import { BinaryGraph } from '../graph/BinaryGraph'
import { Col } from 'components/layout/col'
import { NumberText } from 'components/NumberText'
import { useState } from 'react'

export function BinaryOverview({ contract }: { contract: BinaryContract }) {
  const data = EXAMPLE_POINTS[contract.id as keyof typeof EXAMPLE_POINTS]

  if (!data) return null
  const { cash: cashBetData, play: playBetData } = data

  const { token } = useTokenMode()

  // TODO: actually grab data
  const { betPoints } = token === 'CASH' ? cashBetData : playBetData
  const [graphProbability, setGraphProbability] = useState<number | undefined>(
    undefined
  )

  return (
    <Col style={{ gap: 8 }}>
      <Row
        style={{
          alignItems: 'center',
          gap: 8,
        }}
      >
        {graphProbability ? (
          <NumberText size="3xl">{Math.round(graphProbability)}%</NumberText>
        ) : (
          <BinaryProbability contract={contract} size="3xl" />
        )}
        <ThemedText size="xl">chance</ThemedText>
      </Row>

      <BinaryGraph
        betPoints={betPoints}
        contract={contract}
        onScrollPositionChange={(percent) => {
          setGraphProbability(percent)
        }}
      />
    </Col>
  )
}
