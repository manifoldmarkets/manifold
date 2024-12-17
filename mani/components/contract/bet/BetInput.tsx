import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { NumberText } from 'components/NumberText'
import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'
import React, { useState } from 'react'
import {
  Image,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
} from 'react-native'

interface BetAmountInputProps {
  minAmount?: number
  maxAmount?: number
  onAmountChange: (amount: number) => void
  initialAmount?: number
}

export function BetAmountInput({
  minAmount = 0,
  maxAmount = 1000,
  onAmountChange,
  initialAmount = 0,
}: BetAmountInputProps) {
  const [amount, setAmount] = useState(initialAmount)

  const handleAmountChange = (newAmount: number) => {
    const validAmount = Math.min(Math.max(newAmount, minAmount), maxAmount)
    setAmount(validAmount)
    onAmountChange(validAmount)
  }

  const handleTextInput = (text: string) => {
    if (!text) {
      setAmount(0)
      onAmountChange(0)
      return
    }

    const numericValue = parseFloat(text)
    if (!isNaN(numericValue)) {
      const validAmount = Math.min(Math.max(numericValue, minAmount), maxAmount)
      setAmount(validAmount)
      onAmountChange(validAmount)
    }
  }

  const { mode } = useTokenMode()
  const color = useColor()

  return (
    <View
      style={{
        borderRadius: 6,
      }}
    >
      <Row
        style={{
          alignItems: 'center',
          borderWidth: 1,
          borderColor: color.border,
          padding: 8,
          borderRadius: 6,
          gap: 8,
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <Row style={{ alignItems: 'center', gap: 8 }}>
          <Image
            style={{
              width: 48,
              height: 48,
            }}
            source={
              mode === 'play'
                ? require('assets/images/masses_mana.png')
                : require('assets/images/masses_sweeps.png')
            }
          />
          <TextInput
            style={{
              fontFamily: 'JetBrainsMono',
              fontSize: 48,
              fontWeight: 'bold',
              color: 'white',
            }}
            value={amount.toString()}
            onChangeText={handleTextInput}
            keyboardType="decimal-pad"
            autoFocus={true}
          />
        </Row>
        <Col>
          <Pressable
            style={styles.incrementButton}
            onPress={() => handleAmountChange(amount + 10)}
          >
            <NumberText style={styles.incrementButtonText}>+10</NumberText>
          </Pressable>
          <Pressable
            style={styles.incrementButton}
            onPress={() => handleAmountChange(amount + 50)}
          >
            <NumberText style={styles.incrementButtonText}>+50</NumberText>
          </Pressable>
        </Col>
      </Row>
    </View>
  )
}

const styles = StyleSheet.create({
  incrementButton: {
    backgroundColor: '#2C2C3A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  incrementButtonText: {
    color: 'white',
    fontSize: 12,
  },
  // slider: {
  //   width: '100%',
  //   height: 40,
  // },
})
