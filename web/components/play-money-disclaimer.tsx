import { SparklesIcon } from '@heroicons/react/solid'
import { STARTING_BALANCE } from 'common/economy'
import { formatMoney } from 'common/util/format'

export const PlayMoneyDisclaimer = (props: { text?: string }) => {
  const { text } = props
  return (
    <div className="text-ink-500 my-1 flex items-start justify-center gap-1.5 px-2 text-sm">
      <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {text ? text : `Get ${formatMoney(STARTING_BALANCE)} play money`}
    </div>
  )
}
