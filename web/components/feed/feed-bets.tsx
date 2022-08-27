import dayjs from 'dayjs'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { User } from 'common/user'
import { useUser, useUserById } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/avatar'
import clsx from 'clsx'
import { formatMoney, formatPercent } from 'common/util/format'
import { OutcomeLabel } from 'web/components/outcome-label'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import React, { useEffect } from 'react'
import { UserLink } from '../user-page'
import { formatNumericProbability } from 'common/pseudo-numeric'
import { SiteLink } from 'web/components/site-link'
import { getChallenge, getChallengeUrl } from 'web/lib/firebase/challenges'
import { Challenge } from 'common/challenge'

export function FeedBet(props: { contract: Contract; bet: Bet }) {
  const { contract, bet } = props
  const { userId, createdTime } = bet

  const isBeforeJune2022 = dayjs(createdTime).isBefore('2022-06-01')
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const bettor = isBeforeJune2022 ? undefined : useUserById(userId)

  const user = useUser()
  const isSelf = user?.id === userId

  return (
    <Row className="flex w-full items-center gap-2 pt-3">
      {isSelf ? (
        <Avatar avatarUrl={user.avatarUrl} username={user.username} />
      ) : bettor ? (
        <Avatar avatarUrl={bettor.avatarUrl} username={bettor.username} />
      ) : (
        <EmptyAvatar className="mx-1" />
      )}
      <BetStatusText
        bet={bet}
        contract={contract}
        isSelf={isSelf}
        bettor={bettor}
        className="flex-1"
      />
    </Row>
  )
}

export function BetStatusText(props: {
  contract: Contract
  bet: Bet
  isSelf: boolean
  bettor?: User
  hideOutcome?: boolean
  className?: string
}) {
  const { bet, contract, bettor, isSelf, hideOutcome, className } = props
  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isFreeResponse = outcomeType === 'FREE_RESPONSE'
  const { amount, outcome, createdTime, challengeSlug } = bet
  const [challenge, setChallenge] = React.useState<Challenge>()
  useEffect(() => {
    if (challengeSlug) {
      getChallenge(challengeSlug, contract.id).then((c) => {
        setChallenge(c)
      })
    }
  }, [challengeSlug, contract.id])

  const bought = amount >= 0 ? 'bought' : 'sold'
  const outOfTotalAmount =
    bet.limitProb !== undefined && bet.orderAmount !== undefined
      ? ` / ${formatMoney(bet.orderAmount)}`
      : ''
  const money = formatMoney(Math.abs(amount))

  const hadPoolMatch =
    (bet.limitProb === undefined ||
      bet.fills?.some((fill) => fill.matchedBetId === null)) ??
    false

  const fromProb =
    hadPoolMatch || isFreeResponse
      ? isPseudoNumeric
        ? formatNumericProbability(bet.probBefore, contract)
        : formatPercent(bet.probBefore)
      : isPseudoNumeric
      ? formatNumericProbability(bet.limitProb ?? bet.probBefore, contract)
      : formatPercent(bet.limitProb ?? bet.probBefore)

  const toProb =
    hadPoolMatch || isFreeResponse
      ? isPseudoNumeric
        ? formatNumericProbability(bet.probAfter, contract)
        : formatPercent(bet.probAfter)
      : isPseudoNumeric
      ? formatNumericProbability(bet.limitProb ?? bet.probAfter, contract)
      : formatPercent(bet.limitProb ?? bet.probAfter)

  return (
    <div className={clsx('text-sm text-gray-500', className)}>
      {bettor ? (
        <UserLink name={bettor.name} username={bettor.username} />
      ) : (
        <span>{isSelf ? 'You' : 'A trader'}</span>
      )}{' '}
      {bought} {money}
      {outOfTotalAmount}
      {!hideOutcome && (
        <>
          {' '}
          of{' '}
          <OutcomeLabel
            outcome={outcome}
            value={(bet as any).value}
            contract={contract}
            truncate="short"
          />{' '}
          {fromProb === toProb
            ? `at ${fromProb}`
            : `from ${fromProb} to ${toProb}`}
          {challengeSlug && (
            <SiteLink
              href={challenge ? getChallengeUrl(challenge) : ''}
              className={'mx-1'}
            >
              [challenge]
            </SiteLink>
          )}
        </>
      )}
      <RelativeTimestamp time={createdTime} />
    </div>
  )
}
