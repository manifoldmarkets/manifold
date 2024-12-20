import { Contract, isBinaryMulti } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/use-color'
import { useState } from 'react'
import {
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { BetAmountInput } from './BetInput'
import { Row } from 'components/layout/row'
import { NumberText } from 'components/NumberText'
import { YesNoButton } from 'components/buttons/YesNoButtons'
import { Button } from 'components/buttons/Button'
import { api } from 'lib/api'
import Toast from 'react-native-toast-message'

export type BinaryOutcomes = 'YES' | 'NO'

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

  const answer =
    answerId && 'answers' in contract
      ? contract.answers.find((a) => a.id === answerId)
      : null

  const isBinaryMC = isBinaryMulti(contract)
  const [loading, setLoading] = useState(false)

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
    <Modal
      visible={open}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setOpen(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <Col
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: color.modalOverlay,
            }}
          >
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <Col
                style={{
                  backgroundColor: color.backgroundSecondary,
                  padding: 20,
                  paddingBottom: 32,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  width: '100%',
                  maxHeight: '70%',
                  minHeight: 400,
                  justifyContent: 'space-between',
                }}
              >
                <Col style={{ gap: 4 }}>
                  <ThemedText size="lg" weight="semibold">
                    {contract.question}
                  </ThemedText>

                  <ThemedText size="md" color={color.textSecondary}>
                    {!!answer && !isBinaryMC && answer.text}
                  </ThemedText>
                </Col>
                <BetAmountInput amount={amount} setAmount={setAmount} />
                <Col style={{ gap: 8 }}>
                  <Row
                    style={{ justifyContent: 'space-between', width: '100%' }}
                  >
                    <ThemedText color={color.textTertiary} size="lg">
                      Payout if win
                    </ThemedText>

                    {/* TODO: get real payout */}
                    <NumberText size="lg" weight="semibold">
                      ${(amount * 2).toFixed(2)}{' '}
                      <ThemedText color={color.profitText}>(+200%)</ThemedText>
                    </NumberText>
                  </Row>
                  {isBinaryMC ? (
                    <Button size="lg" onPress={onPress} disabled={loading}>
                      <ThemedText weight="normal">
                        Buy{' '}
                        <ThemedText weight="semibold">{answer.text}</ThemedText>
                      </ThemedText>
                    </Button>
                  ) : (
                    <YesNoButton
                      disabled={loading}
                      variant={outcome === 'YES' ? 'yes' : 'no'}
                      size="lg"
                      title={`Buy ${outcome === 'YES' ? 'Yes' : 'No'}`}
                      onPress={onPress}
                    />
                  )}
                </Col>
              </Col>
            </TouchableWithoutFeedback>
          </Col>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  )
}
