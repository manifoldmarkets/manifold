import clsx from 'clsx'
import { ReactNode, useState } from 'react'

import { CurrencyDollarIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'
import { Tooltip } from 'web/components/widgets/tooltip'
import { CommentBountyDialog } from './comment-bounty-dialog'
import { FormattedMana } from '../mana'

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

  const tooltip = (
    <div>
      {contract.creatorName} may award{' '}
      <FormattedMana amount={COMMENT_BOUNTY_AMOUNT} /> for good comments.{' '}
      <FormattedMana amount={openCommentBounties} /> currently available.
    </div>
  )

  return (
    <Tooltip className="inline-flex" text={tooltip} placement="bottom">
      {modal}
      <SmallBadge
        content={
          <div>
            <FormattedMana amount={openCommentBounties} /> bounty
          </div>
        }
        onClick={bountiesClosed ? undefined : () => setOpen(true)}
      />
    </Tooltip>
  )
}

function SmallBadge(props: {
  content: string | ReactNode
  onClick?: () => void
}) {
  const { content, onClick } = props

  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-300 px-2 py-0.5 text-xs font-medium text-white',
        !onClick && 'cursor-default'
      )}
    >
      <CurrencyDollarIcon className={'h4 w-4'} />
      {content}
    </button>
  )
}
