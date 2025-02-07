import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { Button } from 'components/buttons/button'
import { useColor } from 'hooks/use-color'
import { MultiBetProps } from 'client-common/lib/bet'
import { BinaryOutcomes } from './bet-panel'
import { TokenNumber } from 'components/token/token-number'

export function BetSuccessPanel({
  amount,
  orderAmount,
  shares,
  outcome,
  isBinaryMC,
  multiProps,
  isCashContract,
  onClose,
}: {
  amount: number
  orderAmount: number
  shares: number
  outcome: BinaryOutcomes
  isBinaryMC: boolean
  multiProps?: MultiBetProps
  isCashContract: boolean
  onClose: () => void
}) {
  const color = useColor()

  return (
    <Col style={{ gap: 16, justifyContent: 'space-between', height: '100%' }}>
      <Col style={{ gap: 24, alignItems: 'center', paddingTop: '20%' }}>
        <ThemedText size="2xl" weight="semibold">
          🎉 Bet placed successfully!
        </ThemedText>

        <Col style={{ gap: 16, width: '100%' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText size="md" color={color.textSecondary}>
              Position
            </ThemedText>
            <ThemedText size="md">
              {isBinaryMC
                ? multiProps?.answerText ?? multiProps?.answerToBuy?.text
                : outcome}
            </ThemedText>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText size="md" color={color.textSecondary}>
              Amount filled
            </ThemedText>
            <Row style={{ gap: 4 }}>
              <TokenNumber
                size="md"
                amount={amount}
                token={isCashContract ? 'CASH' : 'MANA'}
                showDecimals
              />
              <ThemedText size="md" color={color.textTertiary}>
                /
              </ThemedText>
              <TokenNumber
                size="md"
                amount={orderAmount}
                token={isCashContract ? 'CASH' : 'MANA'}
                showDecimals
              />
            </Row>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <ThemedText size="md" color={color.textSecondary}>
              Payout if win
            </ThemedText>
            <TokenNumber
              size="md"
              amount={shares}
              token={isCashContract ? 'CASH' : 'MANA'}
              showDecimals
            />
          </Row>
        </Col>
      </Col>

      <Button size="lg" onPress={onClose} style={{ marginTop: 'auto' }}>
        Done
      </Button>
    </Col>
  )
}
