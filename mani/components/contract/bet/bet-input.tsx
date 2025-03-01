import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { NumberText } from 'components/number-text'
import { ThemedText } from 'components/themed-text'
import { Token } from 'components/token/token'
import { Rounded } from 'constants/border-radius'
import { Colors } from 'constants/colors'
import { useColor } from 'hooks/use-color'
import { useEffect, useState } from 'react'
import { View, StyleSheet, Pressable, TextInput, Keyboard } from 'react-native'

export function BetAmountInput({
  minAmount = 0,
  maxAmount = 1000000000,
  setAmount,
  amount,
}: {
  minAmount?: number
  maxAmount?: number
  amount: number
  setAmount: (amount: number) => void
}) {
  const [displayValue, setDisplayValue] = useState<string>(amount.toString())

  // Update displayValue when amount changes from external sources (like slider)
  useEffect(() => {
    // Only update if the numeric values are different to avoid text input disruption
    if (parseFloat(displayValue) !== amount) {
      setDisplayValue(amount.toString())
    }
  }, [amount])

  const handleTextInput = (text: string) => {
    // First, just update what's displayed
    const cleanedText = text
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*)\./g, '$1') // Keep only first decimal point
      .replace(/^0+(?=\d)/, '') // Remove leading zeros
      .replace(/(\.\d{2})\d+$/, '$1') // Limit to 2 decimal places

    setDisplayValue(cleanedText) // Show intermediate typing states

    // Handle empty or just decimal point cases
    if (cleanedText === '' || cleanedText === '.') {
      setAmount(minAmount)
      return
    }

    const parsedValue = parseFloat(cleanedText)
    // Only clamp and update if we have a valid number
    if (!isNaN(parsedValue)) {
      // If the number exceeds maxAmount, update display value to show the limit
      if (parsedValue > maxAmount) {
        setDisplayValue(maxAmount.toString())
      }
      // Clamp the value between minAmount and maxAmount
      const clampedValue = Math.min(Math.max(parsedValue, minAmount), maxAmount)
      const roundedValue = Math.round(clampedValue * 100) / 100
      setAmount(roundedValue)
    }
  }

  const color = useColor()

  return (
    <View
      style={{
        borderRadius: Rounded.md,
      }}
    >
      <Row
        style={{
          alignItems: 'center',
          borderWidth: 1,
          borderColor: color.border,
          padding: 8,
          borderRadius: Rounded.md,
          gap: 8,
          justifyContent: 'space-between',
          width: '100%',
          position: 'relative',
        }}
      >
        <ThemedText
          size="xs"
          color={color.textQuaternary}
          style={{
            position: 'absolute',
            top: -9,
            left: 4,
            backgroundColor: color.background,
            paddingHorizontal: 4,
          }}
        >
          Amount
        </ThemedText>
        <Row style={{ alignItems: 'center', gap: 8, flex: 1 }}>
          <Token
            style={{
              width: 48,
              height: 48,
            }}
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
              setAmount(amount === 1 ? 10 : amount + 10)
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
              setAmount(amount === 1 ? 50 : amount + 50)
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
    borderRadius: Rounded.md,
  },
  incrementButtonText: {
    color: 'white',
    fontSize: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
})
