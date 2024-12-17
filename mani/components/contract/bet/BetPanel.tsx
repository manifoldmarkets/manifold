import { Contract } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'
import React, { useState } from 'react'
import {
  Modal,
  TouchableWithoutFeedback,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { BetAmountInput } from './BetInput'
import { Row } from 'components/layout/row'
import { NumberText } from 'components/NumberText'
import { Button } from 'components/buttons/Button'
import { YesNoButton } from 'components/buttons/YesNoButtons'
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
}) {
  const color = useColor()
  const [amount, setAmount] = useState(0)

  const answer =
    answerId && 'answers' in contract
      ? contract.answers.find((a) => a.id === answerId)
      : null

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
                    {answer && answer.text}
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
                  <YesNoButton
                    variant={outcome === 'YES' ? 'yes' : 'no'}
                    size="lg"
                    title={`Buy ${outcome === 'YES' ? 'Yes' : 'No'}`}
                    onPress={() => {
                      // TODO: add bet logic
                      setOpen(false)
                    }}
                  />
                </Col>
              </Col>
            </TouchableWithoutFeedback>
          </Col>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  )
}
