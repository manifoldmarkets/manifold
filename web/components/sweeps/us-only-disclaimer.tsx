import { LiaFlagUsaSolid } from 'react-icons/lia'
import { Tooltip } from '../widgets/tooltip'
import clsx from 'clsx'

export function UsOnlyDisclaimer(props: { className?: string }) {
  const { className } = props
  return (
    <Tooltip
      className={clsx(
        'text-ink-900 flex select-none flex-row items-center gap-1 font-semibold ',
        className
      )}
      text="Sweepstakes are US only and 18+. All states are eligible except WA, MI, ID, DE"
    >
      <LiaFlagUsaSolid className="text-ink-600 h-6 w-6" /> US only
    </Tooltip>
  )
}
