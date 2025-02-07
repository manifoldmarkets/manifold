import { Contract, isBinaryMulti } from 'common/contract'
import { useSavedContractMetrics } from 'hooks/use-saved-contract-metrics'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import { PositionRow } from 'components/profile/position-row'
import { Rounded } from 'constants/border-radius'

export function UserBetsSummary(props: { contract: Contract }) {
  const { contract } = props
  const [open, setOpen] = useState(false)

  const color = useColor()

  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice =
    contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc

  // Get metrics based on question type
  const baseMetrics = useSavedContractMetrics(contract)
  const answerMetrics = isMultipleChoice
    ? contract.answers?.map((answer) =>
        useSavedContractMetrics(contract, answer.id)
      )
    : []

  // Return null if no positions for either type
  if (!isMultipleChoice && !baseMetrics) return null
  if (isMultipleChoice && !answerMetrics?.some((metric) => metric !== null))
    return null

  return (
    <Col
      style={{
        backgroundColor: color.backgroundSecondary,
        paddingHorizontal: 16,
        paddingTop: 8,
        borderRadius: Rounded.sm,
      }}
    >
      <ThemedText size="md" weight="bold">
        Your Position
      </ThemedText>
      <Col>
        {isMultipleChoice ? (
          <Col style={{ gap: 2 }}>
            {(() => {
              // Calculate last non-null metric index once
              const lastMetricIndex = answerMetrics.reduce(
                (lastIdx, m, idx) => (m ? idx : lastIdx),
                -1
              )

              return answerMetrics.map((metric, index) =>
                metric ? (
                  <PositionRow
                    key={metric.answerId}
                    contract={contract}
                    metric={metric}
                    answer={contract.answers.find(
                      (a) => a.id === metric.answerId
                    )}
                    hasBorder={index !== lastMetricIndex}
                  />
                ) : null
              )
            })()}
          </Col>
        ) : (
          <PositionRow contract={contract} metric={baseMetrics!} />
        )}
      </Col>
    </Col>
  )
}
