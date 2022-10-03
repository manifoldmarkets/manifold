import { CurrencyDollarIcon } from '@heroicons/react/outline'
import { Contract } from 'common/contract'
import { Tooltip } from 'web/components/tooltip'
import { formatMoney } from 'common/util/format'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'

export function BountiedContractBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3  py-0.5 text-sm font-medium text-blue-800">
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
  if (!openCommentBounties) return <div />

  return (
    <Tooltip
      text={CommentBountiesTooltipText(
        contract.creatorName,
        openCommentBounties
      )}
      placement="bottom"
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-300 px-2 py-0.5 text-xs font-medium text-white">
        <CurrencyDollarIcon className={'h3 w-3'} />
        {showAmount && formatMoney(openCommentBounties)} Bounty
      </span>
    </Tooltip>
  )
}

export const CommentBountiesTooltipText = (
  creator: string,
  openCommentBounties: number
) =>
  `${creator} may award ${formatMoney(
    COMMENT_BOUNTY_AMOUNT
  )} for good comments. ${formatMoney(
    openCommentBounties
  )} currently available.`
