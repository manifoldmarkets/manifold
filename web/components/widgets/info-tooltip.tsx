import { InformationCircleIcon } from '@heroicons/react/outline'
import { Tooltip } from './tooltip'
import clsx from 'clsx'
import { Placement } from '@floating-ui/react'

export function InfoTooltip(props: {
  text: string
  className?: string
  children?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  tooltipParams?: {
    className?: string
    placement?: Placement
  }
}) {
  const { text, className, children, size, tooltipParams } = props
  return (
    <Tooltip
      className={clsx('inline-block', tooltipParams?.className)}
      text={text}
      placement={tooltipParams?.placement}
    >
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
          className={clsx(
            'text-ink-500 -mb-1',
            className,
            size === 'sm' && 'h-4 w-4',
            size === 'md' && 'h-5 w-5',
            size === 'lg' && 'h-6 w-6',
            !size && 'h-5 w-5'
          )}
        />
      )}
    </Tooltip>
  )
}
