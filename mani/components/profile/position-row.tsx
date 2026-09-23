import { Answer } from 'common/answer'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { PositionModal } from 'components/bet/position-modal'
import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import { StyleProp, TouchableOpacity, ViewStyle } from 'react-native'
import { getPayoutInfo } from 'common/payouts'
import { useRouter } from 'expo-router'

type PositionRowProps = {
  contract: Contract
  metric: ContractMetric
  answer?: Answer
  showQuestion?: boolean
  hasBorder?: boolean
  style?: StyleProp<ViewStyle>
}

export function PositionRow(props: PositionRowProps) {
  if (props.contract.mechanism === 'perp') {
    return <PerpPositionRow {...props} />
  }
  return <StandardPositionRow {...props} />
}

function StandardPositionRow({
  contract,
  metric,
  answer,
  showQuestion,
  hasBorder,
}: PositionRowProps) {
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

function PerpPositionRow({
  contract,
  metric,
  showQuestion,
  hasBorder,
}: PositionRowProps) {
  const color = useColor()
  const router = useRouter()
  const longSize = finiteNonNegative(metric.totalShares.LONG)
  const shortSize = finiteNonNegative(metric.totalShares.SHORT)
  const positionValue = finiteNumber(metric.payout)
  const profit = finiteNumber(metric.profit)
  const positionLabels = [
    longSize > 0 ? `${Math.round(longSize).toLocaleString()} LONG` : undefined,
    shortSize > 0
      ? `${Math.round(shortSize).toLocaleString()} SHORT`
      : undefined,
  ].filter((label): label is string => label !== undefined)
  const positionLabel =
    positionLabels.length > 0 ? positionLabels.join(' / ') : 'Closed position'

  return (
    <TouchableOpacity
      onPress={() =>
        router.push(`/${contract.creatorUsername}/${contract.slug}`)
      }
      style={{
        gap: 10,
        paddingVertical: 12,
        borderBottomWidth: hasBorder ? 1 : 0,
        borderBottomColor: color.border,
        flexDirection: 'column',
      }}
    >
      {showQuestion && <ThemedText size="md">{contract.question}</ThemedText>}
      <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <ThemedText color={color.blue} size="sm" weight="bold">
          PERPETUAL - {positionLabel}
        </ThemedText>
        <ThemedText color={color.textTertiary} size="xs">
          View details
        </ThemedText>
      </Row>
      <Row style={{ justifyContent: 'space-between', width: '100%' }}>
        <Col>
          <ThemedText color={color.textTertiary} size="xs">
            Position value
          </ThemedText>
          <TokenNumber amount={positionValue} token="MANA" size="md" />
        </Col>
        <Col style={{ alignItems: 'flex-end' }}>
          <ThemedText color={color.textTertiary} size="xs">
            Lifetime profit
          </ThemedText>
          <TokenNumber
            amount={profit}
            token="MANA"
            size="md"
            color={profit >= 0 ? color.profitText : color.error}
          />
        </Col>
      </Row>
    </TouchableOpacity>
  )
}

const finiteNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const finiteNonNegative = (value: unknown) => Math.max(0, finiteNumber(value))
