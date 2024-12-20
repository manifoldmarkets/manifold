import { Row } from 'components/layout/row'
import { BinaryProbability } from '../Probability'
import { BinaryContract } from 'common/contract'
import { ThemedText } from 'components/ThemedText'
import { BinaryGraph } from '../graph/BinaryGraph'
import { Col } from 'components/layout/col'
import { NumberText } from 'components/NumberText'
import { useState } from 'react'
import { HistoryPoint } from 'common/chart'
import { Bet } from 'common/bet'
export function BinaryOverview(props: {
  contract: BinaryContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) {
  const { contract, betPoints } = props

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

      {betPoints.length > 0 && (
        <BinaryGraph
          betPoints={betPoints}
          contract={contract}
          onScrollPositionChange={(percent) => {
            setGraphProbability(percent)
          }}
        />
      )}
    </Col>
  )
}
