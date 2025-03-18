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
  backgroundColor = 'bg-fuchsia-50 dark:bg-fuchsia-800/45'
}: TimelineCardProps) {
  const cardContent = (
    <>
      {/* Increase top padding */}
      <div className="pt-8"></div>

      {/* Padding for timeline */}
      <div className="mb-8">
        <Timeline 
          items={items} 
          lineColor={lineColor} 
          className="px-4 sm:px-6 py-2"
        />
      </div>
    </>
  )

  const cardClassName = `group rounded-lg p-4 border border-ink-200 dark:border-ink-300
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

  return (
    <div className={cardClassName}>
      {cardContent}
    </div>
  )
}