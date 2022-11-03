import clsx from 'clsx'
import { useState } from 'react'

import { CurrencyDollarIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Tooltip } from 'web/components/widgets/tooltip'
import { CommentBountyDialog } from './comment-bounty-dialog'

export function BountiedContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-300 py-0.5 pl-1 pr-2 text-xs font-medium text-white">
      <CurrencyDollarIcon className={'h4 w-4'} /> Bounty
    </span>
  )
}

export function BountiedContractSmallBadge(props: {
  contract: Contract
  showAmount?: boolean
}) {
  const { contract, showAmount } = props
  const { openCommentBounties } = contract

  const [open, setOpen] = useState(false)

  if (!openCommentBounties && !showAmount) return <></>

  const modal = (
    <CommentBountyDialog open={open} setOpen={setOpen} contract={contract} />
  )

  const bountiesClosed =
    contract.isResolved || (contract.closeTime ?? Infinity) < Date.now()

  if (!openCommentBounties) {
    if (bountiesClosed) return <></>

    return (
      <>
        {modal}
        <SmallBadge text="Add bounty" onClick={() => setOpen(true)} />
      </>
    )
  }

  const tooltip = `${contract.creatorName} may award ${formatMoney(
    COMMENT_BOUNTY_AMOUNT
  )} for good comments. ${formatMoney(
    openCommentBounties
  )} currently available.`

  return (
    <Tooltip className="inline-flex" text={tooltip} placement="bottom">
      {modal}
      <SmallBadge
        text={`${formatMoney(openCommentBounties)} bounty`}
        onClick={bountiesClosed ? undefined : () => setOpen(true)}
      />
    </Tooltip>
  )
}

function SmallBadge(props: { text: string; onClick?: () => void }) {
  const { text, onClick } = props

  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-300 px-2 py-0.5 text-xs font-medium text-white',
        !onClick && 'cursor-default'
      )}
    >
      <CurrencyDollarIcon className={'h4 w-4'} />
      {text}
    </button>
  )
}
