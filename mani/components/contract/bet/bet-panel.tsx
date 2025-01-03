import { Contract, isBinaryMulti } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useColor } from 'hooks/use-color'
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { BetAmountInput } from './bet-input'
import { Row } from 'components/layout/row'
import { YesNoButton } from 'components/buttons/yes-no-buttons'
import { Button } from 'components/buttons/button'
import { api } from 'lib/api'
import Toast from 'react-native-toast-message'
import { Modal } from 'components/layout/modal'
import { TokenNumber } from 'components/token/token-number'
import { NumberText } from 'components/number-text'
import { useUser } from 'hooks/use-user'
import Slider from '@react-native-community/slider'
import { useTokenMode } from 'hooks/use-token-mode'
import { MANA_MIN_BET, SWEEPS_MIN_BET } from 'common/economy'
import { formatMoneyNumber } from 'common/util/format'

export type BinaryOutcomes = 'YES' | 'NO'

const AMOUNT_STEPS = [1, 2, 5, 7, 10, 15, 20, 25, 30, 40, 50, 75, 100]

export function BetPanel({
  contract,
  open,
  setOpen,
  outcome,
  answerId,
}: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  outcome: BinaryOutcomes
  answerId?: string
  isBinaryMulti?: boolean
}) {
  const color = useColor()
  const [amount, setAmount] = useState(0)
  const { token } = useTokenMode()

  const answer =
    answerId && 'answers' in contract
      ? contract.answers.find((a) => a.id === answerId)
      : null

  const isBinaryMC = isBinaryMulti(contract)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const user = useUser()

  // Check for errors.
  useEffect(() => {
    if (
      user &&
      ((token === 'MANA' &&
        (user.balance < (amount ?? 0) || user.balance < MANA_MIN_BET)) ||
        (token === 'CASH' &&
          (user.cashBalance < (amount ?? 0) ||
            user.cashBalance < SWEEPS_MIN_BET)))
    ) {
      setError('Insufficient balance')
    } else if (amount !== undefined) {
      if (token === 'CASH' && amount < SWEEPS_MIN_BET) {
        setError(
          'Minimum amount: ' + formatMoneyNumber(SWEEPS_MIN_BET) + ' Sweeps'
        )
      } else if (token === 'MANA' && amount < MANA_MIN_BET) {
        setError('Minimum amount: ' + formatMoneyNumber(MANA_MIN_BET) + ' Mana')
      } else {
        setError(null)
      }
    } else {
      setError(null)
    }
  }, [amount, user, token])

  // TODO: add bet logic
  const onPress = async () => {
    try {
      setLoading(true)
      await api('bet', {
        contractId: contract.id,
        outcome,
        amount,
      })
      Toast.show({
        type: 'success',
        text1: '🎉  Bet placed successfully',
      })
      setOpen(false)
    } catch (e) {
      console.error(e)
      Toast.show({
        type: 'error',
        text1: '💥  Failed to place bet',
        text2: e.message ?? 'Please try again',
      })
    } finally {
      setLoading(false)
    }
  }

  // TODO: figure out keyboard clicking behavior
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} mode="close">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 108 : 0}
        style={{
          flex: 1,
          justifyContent: 'flex-start',
          flexDirection: 'column',
        }}
      >
        <Col style={{ flex: 1, justifyContent: 'space-between' }}>
          <Col style={{ gap: 4 }}>
            <ThemedText size="lg" weight="semibold">
              {contract.question}
            </ThemedText>

            <ThemedText size="md" color={color.textSecondary}>
              {!!answer && !isBinaryMC && answer.text}
            </ThemedText>
          </Col>
          <Col style={{ gap: 12 }}>
            <BetAmountInput amount={amount} setAmount={setAmount} />
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={AMOUNT_STEPS[0]}
              maximumValue={AMOUNT_STEPS[AMOUNT_STEPS.length - 1]}
              value={amount}
              onValueChange={(value) => {
                const closestStep = AMOUNT_STEPS.reduce((prev, curr) =>
                  Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
                )
                setAmount(closestStep)
              }}
              minimumTrackTintColor={color.primaryButton}
              maximumTrackTintColor={color.border}
              thumbTintColor={color.primary}
            />
            {error && <ThemedText color={color.error}>{error}</ThemedText>}
          </Col>
          <Col style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between', width: '100%' }}>
              <ThemedText color={color.textTertiary} size="lg">
                Payout if win
              </ThemedText>

              {/* TODO: get real payout */}
              <Row style={{ alignItems: 'center', gap: 4 }}>
                <TokenNumber amount={amount * 2} size="lg" />
                <NumberText size="lg" color={color.profitText}>
                  (+200%)
                </NumberText>
              </Row>
            </Row>
            {isBinaryMC ? (
              <Button
                size="lg"
                onPress={onPress}
                disabled={loading || error !== null}
                loading={loading}
              >
                <ThemedText weight="normal">
                  Buy <ThemedText weight="semibold">{answer.text}</ThemedText>
                </ThemedText>
              </Button>
            ) : (
              <YesNoButton
                disabled={loading || error !== null}
                loading={loading}
                variant={outcome === 'YES' ? 'yes' : 'no'}
                size="lg"
                title={`Buy ${outcome === 'YES' ? 'Yes' : 'No'}`}
                onPress={onPress}
              />
            )}
          </Col>
        </Col>
      </KeyboardAvoidingView>
    </Modal>
  )
}
