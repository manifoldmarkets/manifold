import { Bet } from 'common/bet'
import { Contract, getBinaryMCProb, isBinaryMulti } from 'common/contract'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { Row } from 'components/layout/row'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useDisplayUserById } from 'hooks/use-user'
import { useContractBets } from 'client-common/hooks/use-bets'
import { api } from 'lib/api'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import { TokenNumber } from 'components/token/token-number'
import { ExpandableContent } from 'components/layout/expandable-content'
import { fromNow } from 'util/time'
import { useColor } from 'hooks/use-color'
import { AvatarCircle } from 'components/user/avatar-circle'
import { UserLink } from 'components/user/user-link'
import { ScrollView } from 'react-native'
import { useState } from 'react'
import { Pagination } from 'components/widgets/pagination'
import { orderBy } from 'lodash'
export function Bets(props: { contract: Contract; totalBets: number }) {
  const { contract } = props
  const bets = orderBy(
    useContractBets(
      contract.id,
      {
        includeZeroShareRedemptions: contract.mechanism === 'cpmm-multi-1',
        filterRedemptions: true,
      },
      useIsPageVisible,
      (params) => api('bets', params)
    ),
    'createdTime',
    'desc'
  )

  if (!bets || bets.length === 0) {
    return null
  }

  return (
    <ExpandableContent
      previewContent={<BetsPreview contract={contract} latestBet={bets[0]} />}
      modalContent={<BetsModal contract={contract} bets={bets} />}
      modalTitle="Activity"
    />
  )
}

export function BetsPreview(props: { contract: Contract; latestBet: Bet }) {
  const { contract, latestBet } = props
  const color = useColor()
  return (
    <Col style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <ThemedText size="md" weight="bold">
          Activity
        </ThemedText>
        <Row>
          <TokenNumber
            size="md"
            amount={contract.volume}
            color={color.primary}
            shortened
          />
          <ThemedText size="md" color={color.textTertiary}>
            {' '}
            volume
          </ThemedText>
        </Row>
      </Row>
      <FeedBet contract={contract} bet={latestBet} />
    </Col>
  )
}

export function BetsModal(props: { contract: Contract; bets: Bet[] }) {
  const { contract, bets } = props
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50
  const betsToShow = bets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return (
    <ScrollView>
      <Col style={{ gap: 16, paddingBottom: 20 }}>
        {betsToShow.map((bet) => (
          <FeedBet key={bet.id} contract={contract} bet={bet} />
        ))}
        {bets.length > PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalItems={bets.length}
            setPage={setPage}
          />
        )}
      </Col>
    </ScrollView>
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
  const color = useColor()
  return (
    <Row>
      <ThemedText
        size="md"
        color={outcome === 'YES' ? color.yesButtonText : color.noButtonText}
        weight="medium"
      >
        {outcome}
      </ThemedText>
      {answer && (
        <ThemedText size="md" color={color.text}>
          {' '}
          • {answer.text}
        </ThemedText>
      )}
    </Row>
  )
}

export function FeedBet(props: { contract: Contract; bet: Bet }) {
  const color = useColor()
  const { bet, contract } = props
  const betUser = useDisplayUserById(bet.userId)
  const { amount, outcome, answerId } = bet
  const getProb = (prob: number) =>
    !isBinaryMulti(contract) ? prob : getBinaryMCProb(prob, outcome)

  const probBefore = getProb(bet.probBefore)

  const limitProb =
    bet.limitProb === undefined || !isBinaryMulti(contract)
      ? bet.limitProb
      : getBinaryMCProb(bet.limitProb, outcome)
  const bought = amount >= 0 ? 'bought' : 'sold'
  const absAmount = Math.abs(amount)

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const fromProb = hadPoolMatch
    ? getFormattedMappedValue(contract, probBefore)
    : getFormattedMappedValue(contract, limitProb ?? probBefore)

  const answer =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.answers?.find((a) => a.id === answerId)
      : undefined

  // ignore empty limit orders or if user doesn't exist
  if (bet.amount <= 0 || !betUser) {
    return null
  }
  return (
    <Row style={{ gap: 8 }}>
      <AvatarCircle
        avatarUrl={betUser.avatarUrl}
        username={betUser.username}
        style={{ paddingTop: 2 }}
      />
      <Col style={{ flex: 1 }}>
        <Row
          style={{
            gap: 4,
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Row>
            <UserLink
              username={betUser.username}
              name={betUser.name}
              size="md"
              limit={10}
            />

            <ThemedText size="md" color={color.text}>
              {' '}
              {bought}{' '}
            </ThemedText>

            <OutcomeLabel
              outcome={outcome}
              answer={answer}
              contract={contract}
              truncate="short"
            />
          </Row>
          <ThemedText size="sm" color={color.textQuaternary}>
            {fromNow(bet.createdTime, true)}
          </ThemedText>
        </Row>
        <Row>
          <TokenNumber
            amount={absAmount}
            token={contract.token}
            size="md"
            color={contract.token === 'MANA' ? color.manaText : color.cashText}
          />
          <ThemedText size="md" color={color.textTertiary}>
            {' '}
            at{' '}
          </ThemedText>
          <ThemedText
            size="md"
            family="JetBrainsMono"
            color={color.textTertiary}
          >
            {fromProb}
          </ThemedText>
        </Row>
      </Col>
    </Row>
  )
}
