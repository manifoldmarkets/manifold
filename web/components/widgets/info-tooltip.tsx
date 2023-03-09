import { InformationCircleIcon } from '@heroicons/react/outline'
import { Tooltip } from './tooltip'
import clsx from 'clsx'

export function InfoTooltip(props: { text: string; className?: string }) {
  const { text, className } = props
  return (
    <Tooltip className="inline-block" text={text}>
      <InformationCircleIcon
        className={clsx('text-ink-500 -mb-1 h-5 w-5', className)}
      />
    </Tooltip>
  )
}
