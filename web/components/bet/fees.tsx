import { formatMoneyToDecimal } from 'common/util/format'
import { InfoTooltip } from '../widgets/info-tooltip'

export const FeeDisplay = (props: {
  totalFees: number
  amount: number | undefined
  isMultiSumsToOne: boolean
}) => {
  const { totalFees, amount, isMultiSumsToOne } = props
  return (
    <span>
      <span className="text-ink-700 font-semibold">
        {formatMoneyToDecimal(totalFees)}
      </span>
      <InfoTooltip
        text={`${(amount ? (100 * totalFees) / amount : 0).toFixed(
          2
        )}% fee. Half goes to the market creator and half is burned. Fees range from 0% to 7%${
          isMultiSumsToOne ? ' (can be slightly higher on multiple choice)' : ''
        } of your bet amount, increasing the more unlikely your bet is to pay out.`}
        className="text-ink-600 ml-1 mt-0.5"
        size="sm"
      />
    </span>
  )
}
