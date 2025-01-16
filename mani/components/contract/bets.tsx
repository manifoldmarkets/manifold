import { StyleSheet } from 'react-native'
import { Bet } from 'common/bet'
import { Contract, getBinaryMCProb, isBinaryMulti } from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { BETTOR } from 'common/user'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useDisplayUserById, useUser } from 'hooks/use-user'
import { useContractBets } from 'client-common/hooks/use-bets'
import { api } from 'lib/api'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import { TokenNumber } from 'components/token/token-number'

export function Bets(props: { contract: Contract; totalBets: number }) {
  const { contract } = props
  // TODO: add pagination and fetching older bets
  const bets = useContractBets(
    contract.id,
    {
      includeZeroShareRedemptions: contract.mechanism === 'cpmm-multi-1',
      filterRedemptions: true,
    },
    useIsPageVisible,
    (params) => api('bets', params)
  )

  return (
    <Col style={styles.container}>
      {bets.map((bet) => (
        <FeedBet key={bet.id} contract={contract} bet={bet} />
      ))}
    </Col>
  )
}

// Skeleton component for RelativeTimestamp
export function RelativeTimestamp(props: {
  time: number
  shortened?: boolean
}) {
  // TODO: Implement proper timestamp formatting
  return (
    <ThemedText size="xs">
      {new Date(props.time).toLocaleDateString()}
    </ThemedText>
  )
}

// Skeleton component for OutcomeLabel
export function OutcomeLabel(props: {
  outcome: string
  answer?: { text: string }
  contract: Contract
  truncate?: 'short'
}) {
  const { outcome, answer } = props
  return (
    <ThemedText size="sm">
      {answer?.text ?? ''} {outcome}
    </ThemedText>
  )
}

// Skeleton component for UserLink
export function UserLink(props: {
  user: { username: string } | null | undefined
  className?: string
}) {
  const { user } = props
  return <ThemedText size="sm">{user?.username ?? 'Anonymous'}</ThemedText>
}

export function FeedBet(props: { contract: Contract; bet: Bet }) {
  const { contract, bet } = props
  //   const { createdTime, userId } = bet
  //   const user = useDisplayUserById(userId)

  return (
    <Row style={styles.row}>
      <BetStatusText bet={bet} contract={contract} />
    </Row>
  )
}

export function BetStatusText(props: {
  contract: Contract
  bet: Bet
  hideUser?: boolean
  className?: string
}) {
  const { bet, contract, hideUser } = props
  const betUser = useDisplayUserById(bet.userId)
  const self = useUser()
  const { amount, outcome, createdTime, answerId } = bet
  const getProb = (prob: number) =>
    !isBinaryMulti(contract) ? prob : getBinaryMCProb(prob, outcome)

  const probBefore = getProb(bet.probBefore)
  const probAfter = getProb(bet.probAfter)
  const limitProb =
    bet.limitProb === undefined || !isBinaryMulti(contract)
      ? bet.limitProb
      : getBinaryMCProb(bet.limitProb, outcome)
  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)
  const money = <TokenNumber amount={absAmount} token={contract.token} />
  const orderAmount =
    bet.limitProb !== undefined && bet.orderAmount !== undefined ? (
      <TokenNumber amount={bet.orderAmount} token={contract.token} />
    ) : null
  const anyFilled = !floatingLesserEqual(amount, 0)
  const allFilled = floatingEqual(amount, bet.orderAmount ?? amount)

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const fromProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probBefore)
    : getFormattedMappedValue(contract, limitProb ?? probBefore)

  const toProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probAfter)
    : getFormattedMappedValue(contract, limitProb ?? probAfter)

  const answer =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers?.find((a) => a.id === answerId)
      : undefined

  return (
    <Row style={styles.betStatusContainer}>
      {!hideUser ? (
        <UserLink user={betUser} />
      ) : (
        <ThemedText size="sm">
          {self?.id === bet.userId ? 'You' : `A ${BETTOR}`}
        </ThemedText>
      )}
      {orderAmount ? (
        <Row style={styles.betStatusRow}>
          {anyFilled ? (
            <ThemedText size="sm">
              filled limit order {money}/{orderAmount}
            </ThemedText>
          ) : (
            <ThemedText size="sm">
              created limit order for {orderAmount}
            </ThemedText>
          )}
          <OutcomeLabel
            outcome={outcome}
            answer={answer}
            contract={contract}
            truncate="short"
          />
          <ThemedText size="sm">at {toProb}</ThemedText>
          {bet.isCancelled && !allFilled ? (
            <ThemedText size="sm">(cancelled)</ThemedText>
          ) : null}
        </Row>
      ) : (
        <Row style={styles.betStatusRow}>
          <ThemedText size="sm">
            {bought} {money}{' '}
          </ThemedText>
          <OutcomeLabel
            outcome={outcome}
            answer={answer}
            contract={contract}
            truncate="short"
          />
          <ThemedText size="sm">
            {fromProb === toProb
              ? `at ${fromProb}`
              : `from ${fromProb} to ${toProb}`}
          </ThemedText>
        </Row>
      )}
      <RelativeTimestamp time={createdTime} shortened={true} />
    </Row>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  betStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  betStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
})
