import { sortBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { ContractMetrics } from 'common/calculate-metrics'
import { Contract, CPMMBinaryContract, CPMMContract } from 'common/contract'
import { Col } from '../layout/col'
import { ContractCardWithPosition } from './contract-card'
import { User } from 'common/user'
import { ContractStatusLabel } from './contracts-list-entry'
import clsx from 'clsx'
import Link from 'next/link'
import { forwardRef } from 'react'
import { useContract } from 'web/hooks/use-contracts'
import { contractPath } from 'web/lib/firebase/contracts'
import { Avatar } from '../widgets/avatar'
import { Row } from '../layout/row'
import { formatPercent } from 'common/util/format'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function ProbChangeTable(props: {
  changes: CPMMContract[] | undefined
  full?: boolean
}) {
  const { changes } = props

  if (!changes) return <LoadingIndicator />

  const biggestChanges = sortBy(changes, (c) =>
    Math.abs(c.probChanges.day)
  ).reverse()

  const contracts = [
    ...biggestChanges.slice(0, 3),
    ...biggestChanges
      .slice(3)
      .filter((c) => Math.abs(c.probChanges.day) >= 0.01),
  ]

  if (contracts.length === 0)
    return <div className="px-4 text-gray-500">None</div>

  return (
    <Col className="w-full divide-y-[0.5px] rounded border-[0.5px] bg-white">
      {contracts.map((contract) => (
        <ContractWithProbChange key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}
const ContractWithProbChange = forwardRef(
  (
    props: {
      contract: Contract
      onContractClick?: (contract: Contract) => void
      className?: string
    },
    ref: React.Ref<HTMLAnchorElement>
  ) => {
    const { onContractClick, className } = props
    const contract = useContract(props.contract.id) ?? props.contract

    const isClosed = contract.closeTime && contract.closeTime < Date.now()
    const textColor =
      isClosed && !contract.isResolved ? 'text-gray-500' : 'text-gray-900'

    return (
      <Link
        onClick={(e) => {
          if (!onContractClick) return
          onContractClick(contract)
          e.preventDefault()
        }}
        ref={ref}
        href={contractPath(contract)}
        className={clsx(
          'group flex flex-col gap-1 whitespace-nowrap px-4 py-3 hover:bg-indigo-50 focus:bg-indigo-50 lg:flex-row lg:gap-2',
          className
        )}
      >
        <Avatar
          className="hidden lg:mr-1 lg:flex"
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="xs"
        />
        <div
          className={clsx(
            'break-anywhere mr-0.5 whitespace-normal font-medium lg:mr-auto',
            textColor
          )}
        >
          {contract.question}
        </div>
        <Row className="gap-3">
          <Avatar
            className="lg:hidden"
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="xs"
          />
          <div className="min-w-[2rem] text-right font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
          {contract.mechanism === 'cpmm-1' && (
            <div
              className={clsx(
                'min-w-[2rem] text-right',
                contract.probChanges.day >= 0
                  ? 'text-teal-500'
                  : 'text-scarlet-500'
              )}
            >
              {contract.probChanges.day >= 0 ? '+' : ''}
              {formatPercent(contract.probChanges.day, true)}
            </div>
          )}
        </Row>
      </Link>
    )
  }
)

export function ProfitChangeCardsTable(props: {
  contracts: CPMMBinaryContract[]
  metrics: ContractMetrics[]
  maxRows?: number
}) {
  const { contracts, metrics, maxRows } = props

  const contractProfit = metrics.map(
    (m) => [m.contractId, m.from?.day.profit ?? 0] as const
  )

  const positiveProfit = sortBy(
    contractProfit.filter(([, profit]) => profit > 0),
    ([, profit]) => profit
  ).reverse()
  const positive = filterDefined(
    positiveProfit.map(([contractId]) =>
      contracts.find((c) => c.id === contractId)
    )
  ).slice(0, maxRows)

  const negativeProfit = sortBy(
    contractProfit.filter(([, profit]) => profit < 0),
    ([, profit]) => profit
  )
  const negative = filterDefined(
    negativeProfit.map(([contractId]) =>
      contracts.find((c) => c.id === contractId)
    )
  ).slice(0, maxRows)

  if (positive.length === 0 && negative.length === 0)
    return <div className="px-4 text-gray-500">None</div>

  return (
    <Col className="mb-4 w-full gap-4 rounded-lg md:flex-row">
      <Col className="flex-1 gap-4">
        {positive.map((contract) => (
          <ContractCardWithPosition
            key={contract.id}
            contract={contract}
            showDailyProfit
          />
        ))}
      </Col>
      <Col className="flex-1 gap-4">
        {negative.map((contract) => (
          <ContractCardWithPosition
            key={contract.id}
            contract={contract}
            showDailyProfit
          />
        ))}
      </Col>
    </Col>
  )
}

export function ProbOrNumericChange(props: {
  contract: CPMMContract
  user?: User | null

  className?: string
}) {
  const { contract } = props
  // Some contract without a probChanges.day was crashing the site, so I added the conditional
  const change = contract.probChanges?.day ?? 0

  if (Math.abs(change * 100) >= 1) {
    return (
      <div className="mr-1 flex items-center justify-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">
        {(change > 0 ? '+' : '') + (change * 100).toFixed(0) + '%'}
      </div>
    )
  }
  return <></>
}
