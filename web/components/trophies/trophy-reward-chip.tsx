import { formatMoney, formatMoneyPrecise } from 'common/util/format'

export function TrophyRewardChip(props: { amount: number }) {
  if (!(props.amount > 0)) return null
  return (
    <span className="w-fit whitespace-nowrap rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
      Pays {formatTrophyReward(props.amount)}
    </span>
  )
}

export const formatTrophyReward = (amount: number) =>
  Number.isInteger(amount) ? formatMoney(amount) : formatMoneyPrecise(amount)
