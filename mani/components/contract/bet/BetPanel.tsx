import { Contract } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/ThemedText'
import { useColor } from 'hooks/useColor'
import React, { useState } from 'react'
import { Modal, TouchableWithoutFeedback, View } from 'react-native'
import { BetAmountInput } from './BetInput'
import { Row } from 'components/layout/row'
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
  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setOpen(false)}
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
            <View
              style={{
                backgroundColor: color.backgroundSecondary,
                padding: 20,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                width: '100%',
                height: '70%',
              }}
            >
              <ThemedText size="lg" weight="semibold">
                {contract.question}
              </ThemedText>
              <ThemedText
                color={
                  outcome === 'YES' ? color.yesButtonText : color.noButtonText
                }
              >
                {outcome === 'YES' ? 'Yes' : 'No'}
              </ThemedText>
              <BetAmountInput onAmountChange={setAmount} />
              <Row style={{ justifyContent: 'space-between', width: '100%' }}>
                <ThemedText>Payout if win</ThemedText>
                <ThemedText>
                  ${(amount * 2).toFixed(2)} <ThemedText>(+200%)</ThemedText>
                </ThemedText>
              </Row>
            </View>
          </TouchableWithoutFeedback>
        </Col>
      </TouchableWithoutFeedback>
    </Modal>
  )
}
