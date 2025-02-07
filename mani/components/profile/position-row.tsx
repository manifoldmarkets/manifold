import { Answer } from 'common/answer'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { PositionModal } from 'components/bet/position-modal'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import { StyleProp, TouchableOpacity, ViewStyle } from 'react-native'
import { getPayoutInfo } from 'common/payouts'

export function PositionRow({
  contract,
  metric,
  answer,
  showQuestion,
  hasBorder,
}: {
  contract: Contract
  metric: ContractMetric
  answer?: Answer
  showQuestion?: boolean
  hasBorder?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { hasYesShares } = metric
  const [open, setOpen] = useState(false)
  const totalSpent = hasYesShares
    ? metric.totalSpent?.YES ?? 0
    : metric.totalSpent?.NO ?? 0

  const totalShares = hasYesShares
    ? metric.totalShares?.YES ?? 0
    : metric.totalShares?.NO ?? 0

  const color = useColor()

  const { payoutWord } = getPayoutInfo(contract, metric, answer)

  return (
    <TouchableOpacity
      onPress={() => setOpen(true)}
      style={{
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: hasBorder ? 1 : 0,
        borderBottomColor: color.border,
        flexDirection: 'column',
      }}
    >
      {showQuestion && <ThemedText size="md">{contract.question}</ThemedText>}
      {answer && (
        <ThemedText size="md" color={color.textTertiary}>
          {answer.text}
        </ThemedText>
      )}
      <Row style={{ justifyContent: 'space-between', width: '100%' }}>
        <Row>
          <TokenNumber amount={totalSpent} size="md" />
          <ThemedText size="md" color={color.textTertiary}>
            {' '}
            on{' '}
          </ThemedText>
          <ThemedText
            size="md"
            color={hasYesShares ? color.yesButtonText : color.noButtonText}
          >
            {hasYesShares ? 'YES' : 'NO'}
          </ThemedText>
        </Row>
        <Row>
          <TokenNumber amount={totalShares} size="md" />
          <ThemedText size="md" color={color.textTertiary}>
            {' '}
            {payoutWord}
          </ThemedText>
        </Row>
      </Row>
      <PositionModal
        contract={contract}
        metric={metric}
        answerId={answer?.id}
        open={open}
        setOpen={setOpen}
      />
    </TouchableOpacity>
  )
}
