import { uniq, keyBy, groupBy, sortBy, mapValues } from 'lodash'
import Link from 'next/link'
import clsx from 'clsx'

import { SEASON_START, SEASON_END } from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { User } from 'common/user'
import { Row } from '../layout/row'
import { usePublicContracts } from 'web/hooks/use-contract-supabase'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Subtitle } from '../widgets/subtitle'
import { Table } from '../widgets/table'
import { UserAvatarAndBadge } from '../widgets/user-link'
import { useContract } from 'web/hooks/use-contracts'
import { Contract, contractPath } from 'common/contract'
import { ContractBetsTable } from '../bet/bets-list'
import { Bet } from 'common/bet'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { ProfitBadge } from '../profit-badge'
import { ContractMetric } from 'common/contract-metric'
import { useBets } from 'web/hooks/use-bets-supabase'
import ShortToggle from '../widgets/short-toggle'
import { useState } from 'react'

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
  const contractsById = keyBy(contracts, 'id')

  const betsByContract = groupBy(bets, 'contractId')
  const metricsByContract =
    contracts &&
    mapValues(betsByContract, (bets, contractId) => {
      const contract = contractsById[contractId]
      return contract ? calculateUserMetrics(contract, bets) : undefined
    })

  const [showHighestFirst, setShowHighestFirst] = useState(true)

  const contractsSorted =
    contracts &&
    metricsByContract &&
    sortBy(contracts, (contract) => metricsByContract[contract.id]?.profit ?? 0)

  const contractsSortedByProfit = showHighestFirst
    ? contractsSorted?.reverse()
    : contractsSorted

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
        <Subtitle className="text-ink-800 !mt-2 !mb-2">Mana earned</Subtitle>
        <Table className="text-base">
          <thead className={clsx('text-ink-600 text-left font-semibold')}>
            <tr>
              <th className={clsx('px-2 pb-1')}>Category</th>
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
          <Col>
            <Subtitle className="text-ink-800 mt-6">Profit by market</Subtitle>
            <Row className="mb-4 gap-2">
              <ShortToggle on={showHighestFirst} setOn={setShowHighestFirst} />{' '}
              Highest first
            </Row>
          </Col>
        )}

        {contracts === undefined && (
          <div className="h-[500px]">
            <LoadingIndicator className="mt-6" />
          </div>
        )}
        <Col className="gap-6">
          {contracts &&
            contractsSortedByProfit &&
            metricsByContract &&
            contractsSortedByProfit.map((contract) => {
              const bets = betsByContract[contract.id]
              const metrics = metricsByContract[contract.id]
              if (!bets || !metrics) return null
              return (
                <ContractBetsEntry
                  key={contract.id}
                  contract={contract}
                  bets={bets}
                  metrics={metrics}
                />
              )
            })}
        </Col>
      </Col>
    </Modal>
  )
}

const ContractBetsEntry = (props: {
  contract: Contract
  bets: Bet[]
  metrics: ContractMetric
}) => {
  const { bets, metrics } = props

  const contract = useContract(props.contract.id) ?? props.contract
  const { profit, profitPercent } = metrics

  return (
    <Col>
      <Row className="gap-2">
        <Link
          href={contractPath(contract)}
          className="text-primary-700 hover:decoration-primary-400 flex-1 font-medium hover:underline hover:decoration-2"
          onClick={(e) => e.stopPropagation()}
        >
          {contract.question}
        </Link>

        <Col>
          <div className="whitespace-nowrap text-right text-lg">
            {formatMoney(profit)}
          </div>
          <ProfitBadge className="text-right" profitPercent={profitPercent} />
        </Col>
      </Row>

      <ContractBetsTable
        contract={contract}
        bets={bets}
        isYourBets={false}
        hideRedemptionAndLoanMessages
      />
    </Col>
  )
}

const MANA_EARNED_CATEGORY_LABELS = {
  PROFIT: 'Profit',
  BETTING_STREAK_BONUS: 'Streak bonuses',
  QUEST_REWARD: 'Quests',
  MARKET_BOOST_REDEEM: 'Boosts claimed',
  UNIQUE_BETTOR_BONUS: 'Trader bonuses',
} as { [key: string]: string }
