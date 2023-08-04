import clsx from 'clsx'
import { CPMMContract, Contract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { formatPercentShort } from 'common/util/format'
import { sortBy } from 'lodash'
import Link from 'next/link'
import { forwardRef } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ContractStatusLabel } from './contracts-table'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'

export function ProbChangeTable(props: {
  changes: CPMMContract[] | undefined
  full?: boolean
}) {
  const { changes } = props

  if (!changes) return <LoadingIndicator />

  const contracts = sortBy(changes, (c) =>
    Math.abs(c.probChanges?.day ?? 0)
  ).reverse()

  if (contracts.length === 0)
    return <div className="text-ink-500 px-4">None</div>

  return (
    <Col className="bg-canvas-0 divide-ink-400 border-ink-400 w-full divide-y-[0.5px] rounded-sm border-[0.5px]">
      {contracts.map((contract) => (
        <ContractWithProbChange key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}
const ContractWithProbChange = forwardRef(
  (
    props: {
      contract: CPMMContract
      onContractClick?: (contract: Contract) => void
      className?: string
    },
    ref: React.Ref<HTMLAnchorElement>
  ) => {
    const { onContractClick, className } = props
    const contract = (useFirebasePublicContract(
      props.contract.visibility,
      props.contract.id
    ) ?? props.contract) as CPMMContract
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
        </Row>
      </Link>
    )
  }
)

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
      <div className="bg-ink-200 mr-1 flex items-center justify-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold">
        {(change > 0 ? '+' : '') + (change * 100).toFixed(0) + '%'}
      </div>
    )
  }
  return <></>
}
