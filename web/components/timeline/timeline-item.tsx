import Link from 'next/link'
import { TimelineItemData } from './timeline'

interface TimelineItemProps {
  item: TimelineItemData
  position: number
  verticalOffset: number
}

export const TimelineItem = ({
  item,
  position,
  verticalOffset,
}: TimelineItemProps) => {
  // Ensure the position is within bounds (5-95% of container width)
  const safePosition = Math.max(5, Math.min(95, position))

  const itemContent = (
    <div className="flex items-center rounded-full px-2 py-1 transition-all hover:bg-fuchsia-100/60 hover:shadow-md dark:hover:bg-fuchsia-900/30 sm:px-2.5">
      {item.icon && (
        <div className="mr-0.75 sm:mr-1.25 text-primary-600 dark:text-primary-500 scale-90 sm:scale-95">
          {item.icon}
        </div>
      )}
      <span
        className="max-w-[150px] truncate whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 sm:max-w-[200px] sm:text-base"
        title={item.title}
      >
        {item.title}
      </span>
      {item.probability !== undefined && (
        <span className="ml-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-1.5 sm:text-sm">
          ({Math.round(item.probability * 100)}%)
        </span>
      )}
    </div>
  )

  const itemStyle = {
    left: `${safePosition}%`,
    transform: `translateX(-50%) translateY(${verticalOffset}px)`,
    transition: 'transform 0.2s ease-out',
    zIndex: verticalOffset !== 0 ? 2 : 1, // Items that are offset get higher z-index
  }

  // If path is provided, make it a link
  if (item.path) {
    return (
      <Link href={item.path} className="absolute" style={itemStyle}>
        {itemContent}
      </Link>
    )
  }

  // Otherwise render as a simple div
  return (
    <div className="absolute" style={itemStyle}>
      {itemContent}
    </div>
  )
}
