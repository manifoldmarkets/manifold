import { formatMoneyToDecimal } from 'common/util/format'
import { InfoTooltip } from '../widgets/info-tooltip'

export const FeeDisplay = (props: {
  totalFees: number
  amount: number | undefined
}) => {
  const { totalFees, amount } = props
  return (
    <span>
      <span className="text-ink-700 font-semibold">
        {formatMoneyToDecimal(totalFees)}
      </span>
      <InfoTooltip
        text={`${(amount ? (100 * totalFees) / amount : 0).toFixed(
          2
        )}% fee. Goes to the market creator up to 1000, then is split 50-50 with Manifold. Fees range from 0% to 7% of your bet amount increasing the more unlikely your bet is to pay out.`}
        className="text-ink-600 ml-1 mt-0.5"
        size="sm"
      />
    </span>
  )
}
