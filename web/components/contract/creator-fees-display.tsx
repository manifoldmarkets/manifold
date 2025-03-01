import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatWithToken } from 'common/util/format'
import { Tooltip } from '../widgets/tooltip'

export const CreatorFeesDisplay = (props: {
  contract: Contract
  className?: string
}) => {
  const { contract, className } = props
  const { collectedFees } = contract
  const isCashContract = contract.token === 'CASH'

  // cash contracts have no creator fees
  if (isCashContract) return null

  return (
    <Tooltip
      text={'Fees earned from trade volume'}
      placement="bottom"
      noTap
      className={clsx(className, 'text-ink-600 text-sm')}
    >
      {formatWithToken({
        amount: collectedFees.creatorFee,
        token: 'M$',
        toDecimal: 2,
      })}{' '}
      earned
    </Tooltip>
  )
}
