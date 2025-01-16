import { StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { CPMMMultiContract, CPMMNumericContract } from 'common/contract'
import { Answer } from 'common/answer'
import { User } from 'common/user'
import { useSavedContractMetrics } from 'hooks/use-saved-contract-metrics'
import { floatingEqual } from 'common/util/math'
import { tradingAllowed } from 'common/contract'
import { TokenNumber } from 'components/token/token-number'
import { Colors } from 'constants/colors'

export function AnswerPosition(props: {
  contract: CPMMMultiContract | CPMMNumericContract
  answer: Answer
  user: User
  style?: StyleProp<ViewStyle>
}) {
  const { contract, answer, style } = props

  const metric = useSavedContractMetrics(contract, answer.id)
  const { invested, totalShares } = metric ?? {
    invested: 0,
    totalShares: { YES: 0, NO: 0 },
  }

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings
  const canSell = tradingAllowed(contract, answer)
  const won =
    (position > 1e-7 && answer.resolution === 'YES') ||
    (position < -1e-7 && answer.resolution === 'NO')

  if (
    !metric ||
    (floatingEqual(yesWinnings, 0) && floatingEqual(noWinnings, 0))
  )
    return null

  return (
    <Row style={[styles.container, style]}>
      <Row style={styles.row}>
        <ThemedText size="xs">
          {canSell ? 'Payout' : won ? 'Paid out' : 'Held out for'}
        </ThemedText>
        {position > 1e-7 ? (
          <Row style={styles.row}>
            <TokenNumber amount={position} />
            <ThemedText size="xs" color={Colors.yesButtonText}>
              {' '}
              on YES
            </ThemedText>
          </Row>
        ) : position < -1e-7 ? (
          <Row style={styles.row}>
            <TokenNumber amount={-position} />
            <ThemedText size="xs" color={Colors.noButtonText}>
              {' '}
              on NO
            </ThemedText>
          </Row>
        ) : (
          <ThemedText size="xs">——</ThemedText>
        )}
      </Row>

      <ThemedText size="xs"> • </ThemedText>

      <Row style={styles.row}>
        <ThemedText size="xs">Spent </ThemedText>
        <TokenNumber amount={invested} />
      </Row>

      {canSell && (
        <>
          <ThemedText size="xs"> • </ThemedText>
          <ThemedText
            size="xs"
            weight="bold"
            onPress={() => {
              // TODO: Implement sell functionality
            }}
          >
            Sell
          </ThemedText>
        </>
      )}
    </Row>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
})
