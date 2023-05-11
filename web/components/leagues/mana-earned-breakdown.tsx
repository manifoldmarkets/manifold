import { uniq, keyBy } from 'lodash'
import { useMemo } from 'react'
import clsx from 'clsx'

import { SEASON_START, SEASON_END } from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { User } from 'common/user'
import { Row } from '../layout/row'
import { useBets } from 'web/hooks/use-bets'
import { usePublicContracts } from 'web/hooks/use-contract-supabase'
import { ContractMention } from '../contract/contract-mention'
import { FeedBet } from '../feed/feed-bets'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Subtitle } from '../widgets/subtitle'
import { Table } from '../widgets/table'
import { UserAvatarAndBadge } from '../widgets/user-link'

export const ManaEarnedBreakdown = (props: {
  user: User
  showDialog: boolean
  setShowDialog: (show: boolean) => void
  mana_earned: number
  mana_earned_breakdown: { [key: string]: number }
}) => {
  const {
    user,
    showDialog,
    setShowDialog,
    mana_earned,
    mana_earned_breakdown,
  } = props

  const breakdown = {
    PROFIT: mana_earned_breakdown.profit,
    ...mana_earned_breakdown,
    MARKET_BOOST_REDEEM:
      (mana_earned_breakdown.MARKET_BOOST_REDEEM ?? 0) +
      (mana_earned_breakdown.AD_REDEEM ?? 0),
  } as { [key: string]: number }

  const loadingBets = useBets({
    userId: user.id,
    afterTime: SEASON_START.getTime(),
    beforeTime: SEASON_END.getTime(),
    order: 'desc',
  })
  const bets = loadingBets ?? []

  const contracts = usePublicContracts(
    loadingBets ? uniq(loadingBets.map((b) => b.contractId)) : undefined
  )

  const betIdToContract = useMemo(() => {
    const contractsById = keyBy(contracts, 'id')
    return Object.fromEntries(
      bets.map((bet) => [bet.id, contractsById[bet.contractId]])
    )
  }, [contracts])

  return (
    <Modal
      className={clsx(MODAL_CLASS, '')}
      open={showDialog}
      setOpen={(open) => setShowDialog(open)}
      noAutoFocus
    >
      <Col>
        <Row className="mb-2 items-center gap-4">
          <UserAvatarAndBadge
            name={user.name}
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
        </Row>
        <Table>
          <thead
            className={clsx('text-ink-600 text-left text-sm font-semibold')}
          >
            <tr>
              <th className={clsx('px-2 pb-1')}>Earning type</th>
              <th className={clsx('px-2 pb-1 text-right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(MANA_EARNED_CATEGORY_LABELS).map((category) => (
              <tr key={category}>
                <td className={clsx('pl-2')}>
                  {MANA_EARNED_CATEGORY_LABELS[category]}
                </td>
                <td className={clsx('pr-2 text-right')}>
                  {formatMoney(breakdown[category] ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className={clsx('pl-2')}>Total</td>
              <td className={clsx('pr-2 text-right')}>
                {formatMoney(mana_earned)}
              </td>
            </tr>
          </tbody>
        </Table>

        {contracts && contracts.length > 0 && (
          <Subtitle className="mt-4">Trades this season</Subtitle>
        )}
        {contracts === undefined && (
          <div className="h-[500px]">
            <LoadingIndicator className="mt-6" />
          </div>
        )}
        <Col className="">
          {bets.map((bet, i) => {
            const contract = betIdToContract[bet.id]
            if (!contract) return null

            const prevContract = i > 0 ? betIdToContract[bets[i - 1].id] : null
            const showContract =
              !prevContract || prevContract.id !== contract.id

            return (
              <Col className={clsx('gap-2', showContract ? 'pt-4' : 'pt-2')}>
                {showContract && (
                  <ContractMention contract={betIdToContract[bet.id]} />
                )}
                <FeedBet
                  key={bet.id}
                  bet={bet}
                  contract={betIdToContract[bet.id]}
                />
              </Col>
            )
          })}
        </Col>
      </Col>
    </Modal>
  )
}

const MANA_EARNED_CATEGORY_LABELS = {
  PROFIT: 'Profit',
  BETTING_STREAK_BONUS: 'Streak bonuses',
  QUEST_REWARD: 'Quests',
  MARKET_BOOST_REDEEM: 'Boosts claimed',
  UNIQUE_BETTOR_BONUS: 'Trader bonuses',
} as { [key: string]: string }
