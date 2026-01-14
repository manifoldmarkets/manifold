import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { groupBy, keyBy, mapValues, sortBy, uniq } from 'lodash'
import Link from 'next/link'

import { Bet } from 'common/bet'
import { calculateUserMetricsWithoutLoans } from 'common/calculate-metrics'
import { Contract, contractPath } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import {
  excludeSelfTrades,
  filterBetsForLeagueScoring,
  getApproximateSeasonDates,
} from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { usePublicContracts } from 'web/hooks/use-contract'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { ProfitBadge } from '../profit-badge'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserAvatarAndBadge } from '../widgets/user-link'

import { useBetsOnce } from 'client-common/hooks/use-bets'
import { DisplayUser } from 'common/api/user-types'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'
import { useState } from 'react'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'
import ShortToggle from '../widgets/short-toggle'

export const ManaEarnedBreakdown = (props: {
  user: DisplayUser
  season: number
  showDialog: boolean
  setShowDialog: (show: boolean) => void
  mana_earned: number
  mana_earned_breakdown: { [key: string]: number }
}) => {
  const { user, season, showDialog, setShowDialog, mana_earned_breakdown } =
    props

  const { data: seasonInfo } = useAPIGetter('get-season-info', { season })
  const { start: approxStart, approxEnd } = getApproximateSeasonDates(season)
  const start = seasonInfo?.startTime
    ? new Date(seasonInfo.startTime)
    : approxStart

  const end = seasonInfo?.endTime ? new Date(seasonInfo.endTime) : approxEnd
  const loadingBets = useBetsOnce((params) => api('bets', params), {
    userId: user.id,
    afterTime: start.getTime(),
    beforeTime: end.getTime(),
    order: 'desc',
  })
  const bets = loadingBets ?? []

  const contractIds = loadingBets
    ? uniq(loadingBets.map((b) => b.contractId))
    : undefined
  const contracts = usePublicContracts(contractIds)?.filter(
    (c) => c.isRanked !== false && c.token === 'MANA'
  )

  const contractsById = keyBy(contracts, 'id')

  const betsByContract = groupBy(bets, 'contractId')
  const metricsByContract =
    contracts &&
    mapValues(betsByContract, (bets, contractId) => {
      const contract = contractsById[contractId]
      if (!contract) return undefined

      const nonSelfTradeBets = excludeSelfTrades(bets, user.id)
      const relevantBets = filterBetsForLeagueScoring(
        nonSelfTradeBets,
        contract,
        user.id
      )

      return relevantBets.length > 0
        ? calculateUserMetricsWithoutLoans(
            contract,
            relevantBets,
            user.id
          ).find((cm) => !cm.answerId)
        : undefined
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
      className={clsx(MODAL_CLASS)}
      open={showDialog}
      setOpen={(open) => setShowDialog(open)}
    >
      <Col className="gap-4">
        {/* Header */}
        <Row className="items-center gap-3">
          <UserAvatarAndBadge user={user} />
        </Row>

        {/* Summary Stats */}
        <div className="bg-canvas-50 divide-ink-100 divide-y rounded-lg border border-ink-200">
          <Row className="items-center justify-between p-3">
            <span className="text-ink-600 text-sm">Trading profit</span>
            <span className="text-ink-900 font-medium">
              {formatMoney(mana_earned_breakdown?.profit ?? 0)}
            </span>
          </Row>
          <Row className="items-center justify-between p-3">
            <span className="text-ink-600 text-sm">Unique trader bonuses</span>
            <span className="text-ink-900 font-medium">
              {formatMoney(mana_earned_breakdown?.UNIQUE_BETTOR_BONUS ?? 0)}
            </span>
          </Row>
        </div>

        <p className="text-ink-500 text-xs">
          Only counts profit on trades placed on or after{' '}
          {start.toLocaleDateString()}.
        </p>

        {contracts && contracts.length > 0 && (
          <Row className="items-center gap-2">
            <ShortToggle on={showHighestFirst} setOn={setShowHighestFirst} />
            <span className="text-ink-600 text-sm">Highest first</span>
          </Row>
        )}

        {contracts === undefined && (
          <div className="py-12">
            <LoadingIndicator />
          </div>
        )}

        <Col className="gap-4">
          {contracts &&
            contractsSortedByProfit &&
            metricsByContract &&
            contractsSortedByProfit.map((contract) => {
              const bets = betsByContract[contract.id]
              const metrics = metricsByContract[contract.id]
              if (!bets || !metrics) return null

              const nonSelfTradeBets = excludeSelfTrades(bets, user.id)
              const relevantBets = filterBetsForLeagueScoring(
                nonSelfTradeBets,
                contract,
                user.id
              )

              if (relevantBets.length === 0) return null

              return (
                <ContractBetsEntry
                  key={contract.id}
                  contract={contract}
                  bets={relevantBets}
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
  const { bets, metrics, contract } = props
  const { profit, profitPercent } = metrics

  const showExpander = bets.length > 2
  const [expanded, setExpanded] = useState(false)

  return (
    <Col className="border-ink-100 border-t pt-4 first:border-t-0 first:pt-0">
      <Row className="gap-3">
        <Link
          href={contractPath(contract)}
          className="text-ink-900 flex-1 text-sm font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {contract.question}
        </Link>

        <Col className="shrink-0 items-end">
          <span className="text-ink-900 font-medium tabular-nums">
            {formatMoney(profit)}
          </span>
          <ProfitBadge className="text-xs" profitPercent={profitPercent} />
        </Col>
      </Row>

      {showExpander && (
        <button
          className="text-ink-500 hover:text-ink-700 mt-2 flex items-center gap-1 self-start text-sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronUpIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
          {capitalize(TRADE_TERM)}s
        </button>
      )}

      {(!showExpander || expanded) && (
        <div className="mt-2">
          <ContractBetsTable
            contract={contract}
            bets={bets}
            isYourBets={false}
            contractMetric={metrics}
            hideRedemptionAndLoanMessages
          />
        </div>
      )}
    </Col>
  )
}
