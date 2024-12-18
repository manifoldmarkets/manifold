import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { NumberText } from 'components/NumberText'
import { Colors } from 'constants/Colors'
import { useColor } from 'hooks/useColor'
import { useTokenMode } from 'hooks/useTokenMode'
import { useState } from 'react'
import {
  Image,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Keyboard,
} from 'react-native'

export function BetAmountInput({
  minAmount = 0,
  maxAmount = 1000,
  setAmount,
  amount,
}: {
  minAmount?: number
  maxAmount?: number
  amount: number
  setAmount: (amount: number) => void
}) {
  const [displayValue, setDisplayValue] = useState<string>(amount.toString())

  const handleAmountChange = (newAmount: number) => {
    const validAmount = Math.min(Math.max(newAmount, minAmount), maxAmount)
    setAmount(validAmount)
    setDisplayValue(validAmount.toString())
  }

  const handleTextInput = (text: string) => {
    // First, just update what's displayed
    const cleanedText = text
      .replace(/[^0-9.]/g, '') // Allow only numbers and decimal point
      .replace(/(\..*)\./g, '$1') // Allow only one decimal point
      .replace(/^0+(?=\d)/, '')

    const numberValue = Math.min(parseFloat(cleanedText) || 0, maxAmount)
    const roundedValue = Math.round(numberValue * 100) / 100

    if (roundedValue == maxAmount) {
      setDisplayValue(maxAmount.toString())
    } else if (cleanedText.split('.')[1]?.length > 2) {
      // If there are more than 2 decimal places, show the rounded value
      setDisplayValue(roundedValue.toString())
    } else {
      setDisplayValue(cleanedText)
    }
    setAmount(roundedValue)
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
          borderColor: color.borderSecondary,
          padding: 8,
          borderRadius: 6,
          gap: 8,
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <Row style={{ alignItems: 'center', gap: 8, flex: 1 }}>
          <Image
            style={{
              width: 48,
              height: 48,
            }}
            source={
              mode === 'play'
                ? require('../../../assets/images/masses_mana.png')
                : require('../../../assets/images/masses_sweeps.png')
            }
          />
          <TextInput
            style={{
              fontFamily: 'JetBrainsMono',
              fontSize: 48,
              fontWeight: 'bold',
              color: 'white',
              flex: 1,
            }}
            value={displayValue}
            onChangeText={handleTextInput}
            keyboardType="decimal-pad"
            autoFocus={true}
            returnKeyType="done"
            onSubmitEditing={() => {
              // Handle what happens when enter/done is pressed
              // For example, you might want to blur the input
              Keyboard.dismiss()
            }}
          />
        </Row>
        <Col style={{ gap: 8 }}>
          <Pressable
            style={[
              styles.incrementButton,
              amount + 10 > maxAmount && styles.disabledButton,
            ]}
            onPress={(e) => {
              e.stopPropagation()
              handleAmountChange(amount + 10)
            }}
            disabled={amount + 10 > maxAmount}
          >
            <NumberText style={styles.incrementButtonText}>+10</NumberText>
          </Pressable>
          <Pressable
            style={[
              styles.incrementButton,
              amount + 50 > maxAmount && styles.disabledButton,
            ]}
            onPress={(e) => {
              e.stopPropagation()
              handleAmountChange(amount + 50)
            }}
            disabled={amount + 50 > maxAmount}
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
    backgroundColor: Colors.grayButtonBackground,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  incrementButtonText: {
    color: 'white',
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
})
