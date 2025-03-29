import { ClickFrame } from 'web/components/widgets/click-frame'
import { Timeline, TimelineItemData } from './timeline'

export interface TimelineCardProps {
  items: TimelineItemData[]
  path?: string
  className?: string
  lineColor?: string
  backgroundColor?: string
}

export function TimelineCard({
  items,
  path,
  className = '',
  lineColor,
  backgroundColor = 'bg-fuchsia-50 dark:bg-fuchsia-800/45',
}: TimelineCardProps) {
  const cardContent = (
    <>
      {/* Title row */}
      <div className="mb-14">
        <div className="flex justify-between">
          <div className="font-semibold text-gray-700 dark:text-gray-100 sm:text-lg">
            Release Timelines
          </div>
        </div>
      </div>

      {/* Padding for timeline */}
      <div className="mb-4 sm:mb-10">
        <Timeline
          items={items}
          lineColor={lineColor}
          className="px-0 py-2 sm:px-6"
        />
      </div>
    </>
  )

  const cardClassName = `group rounded-lg p-2 sm:p-4 border border-ink-200 dark:border-ink-300
    transition-all hover:shadow-md shadow-[2px_2px_4px_rgba(0,0,0,0.05)] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.15)] 
    relative overflow-hidden ${backgroundColor} ${className}`

  if (path) {
    return (
      <ClickFrame
        className={cardClassName}
        onClick={() => path && window.open(path, '_blank')}
      >
        {cardContent}
      </ClickFrame>
    )
  }

  return <div className={cardClassName}>{cardContent}</div>
}
