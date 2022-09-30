import { CurrencyDollarIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'
import { Tooltip } from 'web/components/tooltip'
import { formatMoney } from 'common/lib/util/format'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'

export function BountiedContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3  py-0.5 text-sm font-medium text-blue-800">
      <CurrencyDollarIcon className={'h4 w-4'} /> Bounty
    </span>
  )
}

export function BountiedContractSmallBadge(props: { contract: Contract }) {
  const { contract } = props
  const { openCommentBounties } = contract
  if (!openCommentBounties) return <div />

  return (
    <Tooltip text={CommentBountiesTooltipText(openCommentBounties)}>
      <span className="bg-greyscale-4 inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white">
        <CurrencyDollarIcon className={'h3 w-3'} /> Bountied Comments
      </span>
    </Tooltip>
  )
}

export const CommentBountiesTooltipText = (openCommentBounties: number) =>
  `The creator of this market may award ${formatMoney(
    COMMENT_BOUNTY_AMOUNT
  )} for good comments. ${formatMoney(
    openCommentBounties
  )} currently available.`
