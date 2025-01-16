import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { StyleSheet } from 'react-native'
import { User } from 'common/user'
import { useSavedContractMetrics } from 'hooks/use-saved-contract-metrics'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { IconSymbol } from 'components/ui/icon-symbol'
import { TokenNumber } from 'components/token/token-number'

export function UserBetsSummary(props: {
  contract: Contract
  initialMetrics?: ContractMetric
  includeSellButton?: User | null | undefined
}) {
  const { contract, includeSellButton } = props
  const metrics = useSavedContractMetrics(contract) ?? props.initialMetrics

  if (!metrics) return null
  return (
    <BetsSummary
      contract={contract}
      metrics={metrics}
      includeSellButton={includeSellButton}
    />
  )
}

export function BetsSummary(props: {
  contract: Contract
  metrics: ContractMetric
  includeSellButton?: User | null | undefined
}) {
  const { contract, metrics } = props
  const { resolution, outcomeType } = contract
  const color = useColor()

  const { payout, invested, totalShares = {}, profit, profitPercent } = metrics

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0

  const position = yesWinnings - noWinnings
  const exampleOutcome = position < 0 ? 'NO' : 'YES'

  const isBinary = outcomeType === 'BINARY'
  //  const mainBinaryMCAnswer = getMainBinaryMCAnswer(contract)

  if (metrics.invested === 0 && metrics.profit === 0) return null

  return (
    <Col style={styles.container}>
      <Row style={styles.statsRow}>
        {resolution ? (
          <Col>
            <ThemedText size="sm" color={color.textSecondary}>
              Payout
            </ThemedText>
            <Row style={{ alignItems: 'center', gap: 4 }}>
              <TokenNumber size="lg" amount={payout} />
              <ThemedText
                color={
                  profitPercent >= 0 ? color.profitText : color.textSecondary
                }
                size="sm"
              >
                ({profitPercent >= 0 ? '+' : ''}
                {Math.round(profitPercent)}%)
              </ThemedText>
            </Row>
          </Col>
        ) : isBinary ? (
          <Col>
            <ThemedText size="sm" color={color.textSecondary}>
              Payout
              <IconSymbol
                name="info"
                size={12}
                color={color.textTertiary}
                style={{ marginLeft: 4 }}
              />
            </ThemedText>
            <Row style={{ alignItems: 'center', gap: 4 }}>
              <TokenNumber size="lg" amount={Math.abs(position)} />
              <ThemedText size="sm" color={color.textSecondary}>
                on {exampleOutcome}
              </ThemedText>
            </Row>
          </Col>
        ) : null}

        <Col>
          <ThemedText size="sm" color={color.textSecondary}>
            Spent
            <IconSymbol
              name="info"
              size={12}
              color={color.textTertiary}
              style={{ marginLeft: 4 }}
            />
          </ThemedText>
          <TokenNumber size="lg" amount={invested} />
        </Col>

        <Col>
          <ThemedText size="sm" color={color.textSecondary}>
            Profit
            <IconSymbol
              name="info"
              size={12}
              color={color.textTertiary}
              style={{ marginLeft: 4 }}
            />
          </ThemedText>
          <Row style={{ alignItems: 'center', gap: 4 }}>
            <TokenNumber size="lg" amount={profit} />
            <ThemedText
              color={
                profitPercent >= 0 ? color.profitText : color.textSecondary
              }
              size="sm"
            >
              ({profitPercent >= 0 ? '+' : ''}
              {Math.round(profitPercent)}%)
            </ThemedText>
          </Row>
        </Col>
      </Row>
    </Col>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  statsRow: {
    flexWrap: 'wrap',
    gap: 24,
  },
})
