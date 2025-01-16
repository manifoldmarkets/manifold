import { Contract, isBinaryMulti, tradingAllowed } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { useSavedContractMetrics } from 'hooks/use-saved-contract-metrics'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { TokenNumber } from 'components/token/token-number'
import { ExpandableContent } from 'components/layout/expandable-content'
import { floatingEqual } from 'common/util/math'

export function UserBetsSummary(props: { contract: Contract }) {
  const { contract } = props
  const metrics = useSavedContractMetrics(contract)

  if (!metrics) return null
  return (
    // TODO: make this a modal
    <ExpandableContent
      previewContent={<YourBetsPreview contract={contract} metrics={metrics} />}
      modalContent={undefined}
    />
  )
}

export function YourBetsPreview(props: {
  contract: Contract
  metrics: ContractMetric
}) {
  const { contract, metrics } = props
  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice =
    contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc

  console.log(metrics)

  return (
    <Col style={{ gap: 8 }}>
      <ThemedText size="md" weight="bold">
        Your Position
      </ThemedText>
      <Col>
        {isMultipleChoice ? (
          <Col>
            {contract.answers?.map((answer) => (
              <PositionRow
                key={answer.id}
                contract={contract}
                answer={answer}
              />
            ))}
          </Col>
        ) : (
          <PositionRow contract={contract} />
        )}
      </Col>
    </Col>
  )
}

export function PositionRow(props: { contract: Contract; answer?: Answer }) {
  const { contract, answer } = props
  const metric = useSavedContractMetrics(contract, answer.id)
  const { invested, totalShares } = metric ?? {
    invested: 0,
    totalShares: { YES: 0, NO: 0 },
  }
  const color = useColor()

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const canSell = tradingAllowed(contract, answer)

  const position = yesWinnings - noWinnings
  const exampleOutcome = position < 0 ? 'NO' : 'YES'
  const won =
    (position > 1e-7 && answer.resolution === 'YES') ||
    (position < -1e-7 && answer.resolution === 'NO')

  if (
    !metric ||
    (floatingEqual(yesWinnings, 0) && floatingEqual(noWinnings, 0))
  )
    return null

  return (
    <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Row>
        <ThemedText
          size="md"
          color={
            exampleOutcome === 'YES' ? color.yesButtonText : color.noButtonText
          }
          weight="medium"
        >
          {exampleOutcome}
        </ThemedText>
        {answer && (
          <ThemedText size="md" color={color.textTertiary}>
            {' '}
            • {answer.text}
          </ThemedText>
        )}
      </Row>
      <Row>
        <TokenNumber size="md" amount={position} color={color.primary} />
        <ThemedText size="md" color={color.textTertiary}>
          {canSell ? ' payout' : won ? ' paid out' : ' unrealized'}
        </ThemedText>
      </Row>
    </Row>
  )
}
