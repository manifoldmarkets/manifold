import { InformationCircleIcon } from '@heroicons/react/outline'
import { Tooltip } from './tooltip'
import clsx from 'clsx'

export function InfoTooltip(props: {
  text: string
  className?: string
  children?: React.ReactNode
}) {
  const { text, className, children } = props
  return (
    <Tooltip className="inline-block" text={text}>
      {children ? (
        <span
          className={clsx(
            'cursor-help border-b border-dotted border-gray-600',
            className
          )}
        >
          {children}
        </span>
      ) : (
        <InformationCircleIcon
          className={clsx('text-ink-500 -mb-1 h-5 w-5', className)}
        />
      )}
    </Tooltip>
  )
}
