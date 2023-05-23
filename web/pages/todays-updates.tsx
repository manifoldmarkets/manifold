import { forwardRef, useEffect, useState } from 'react'
import { sortBy } from 'lodash'
import clsx from 'clsx'
import Link from 'next/link'

import { ContractMetrics } from 'common/calculate-metrics'
import { CPMMContract, Contract, contractPath } from 'common/contract'
import { getContractMetricsForContractIds } from 'common/supabase/contract-metrics'
import { formatPercentShort, formatMoney } from 'common/util/format'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useUser } from 'web/hooks/use-user'
import { useYourDailyChangedContracts } from 'web/hooks/use-your-daily-changed-contracts'
import { db } from 'web/lib/supabase/db'
import { getContractBetNullMetrics } from 'common/calculate'

export default function TodaysUpdates() {
  const user = useUser()
  const changedContracts = useYourDailyChangedContracts(db, user?.id, 50)
  const metrics = useContractMetrics(user?.id, changedContracts)

  const contractMetrics = changedContracts?.map((contract) => ({
    metrics:
      metrics?.find((m) => contract.id === m.contractId) ??
      getContractBetNullMetrics(),
    contract,
  }))

  const isLoading = !changedContracts || !metrics

  return (
    <Page>
      <Title>Today's updates</Title>
      {isLoading ? (
        <LoadingIndicator />
      ) : (
        <ContractChangeTable contractMetrics={contractMetrics} />
      )}
    </Page>
  )
}

const useContractMetrics = (
  userId: string | null | undefined,
  contracts: Contract[] | undefined
) => {
  const [metrics, setMetrics] = useState<ContractMetrics[] | undefined>()
  useEffect(() => {
    if (userId && contracts) {
      getContractMetricsForContractIds(
        db,
        userId,
        contracts.map((c) => c.id)
      ).then(setMetrics)
    }
  }, [userId, contracts])
  return metrics
}

export function ContractChangeTable(props: {
  contractMetrics:
    | { contract: CPMMContract; metrics: ContractMetrics }[]
    | undefined
}) {
  const { contractMetrics } = props

  if (!contractMetrics) return <LoadingIndicator />

  const sortedContractMetrics = sortBy(contractMetrics, ({ contract }) =>
    Math.abs(contract.probChanges?.day ?? 0)
  ).reverse()

  if (sortedContractMetrics.length === 0)
    return <div className="text-ink-500 px-4">None</div>

  return (
    <Col className="bg-canvas-0 divide-ink-400 border-ink-400 w-full divide-y-[0.5px] rounded-sm border-[0.5px]">
      {sortedContractMetrics.map(({ contract, metrics }) => (
        <ContractChangeRow
          key={contract.id}
          contract={contract}
          metrics={metrics}
        />
      ))}
    </Col>
  )
}
const ContractChangeRow = forwardRef(
  (
    props: {
      contract: CPMMContract
      onContractClick?: (contract: Contract) => void
      metrics: ContractMetrics
      className?: string
    },
    ref: React.Ref<HTMLAnchorElement>
  ) => {
    const { contract, metrics, onContractClick, className } = props
    const {
      creatorUsername,
      creatorAvatarUrl,
      closeTime,
      isResolved,
      question,
      probChanges,
    } = contract

    const isClosed = closeTime && closeTime < Date.now()
    const textColor = isClosed && !isResolved ? 'text-ink-500' : 'text-ink-900'

    const probChangeToday = probChanges?.day ?? 0
    const { from } = metrics
    const todaysProfit = from ? from.day.profit : 0

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
          'group flex flex-col gap-1 whitespace-nowrap px-4 py-3 lg:flex-row lg:gap-2',
          'focus:bg-ink-300/30 lg:hover:bg-ink-300/30 transition-colors',
          className
        )}
      >
        <Avatar
          className="hidden lg:mr-1 lg:flex"
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size="xs"
        />
        <div
          className={clsx(
            'break-anywhere mr-0.5 whitespace-normal font-medium lg:mr-auto',
            textColor
          )}
        >
          {question}
        </div>
        <Row className="gap-3">
          <Avatar
            className="lg:hidden"
            username={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            size="xs"
          />
          <div className="min-w-[2rem] text-right font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
          <div
            className={clsx(
              'min-w-[2rem] text-right',
              probChangeToday >= 0 ? 'text-teal-500' : 'text-scarlet-500'
            )}
          >
            {probChangeToday >= 0 ? '+' : ''}
            {formatPercentShort(probChangeToday)}
          </div>
          <div
            className={clsx(
              'min-w-[3.25rem] sm:text-right',
              todaysProfit >= 0 ? 'text-teal-500' : 'text-scarlet-500'
            )}
          >
            {todaysProfit >= 0 ? '+' : ''}
            {formatMoney(todaysProfit)}
          </div>
        </Row>
      </Link>
    )
  }
)
