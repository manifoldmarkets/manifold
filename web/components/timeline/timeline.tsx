import React from 'react'
import { format as formatDateFn } from 'date-fns'
import { TimelineItem } from './timeline-item'
import { filterDefined } from 'common/util/array'
// Type for model data
export type TimelineItemData = {
  title: string
  path?: string // URL to market
  releaseDate: Date
  icon?: React.ReactNode
  probability?: number
}

export interface TimelineProps {
  items: TimelineItemData[]
  startDate?: Date
  endDate?: Date
  className?: string
  lineColor?: string
}

export const Timeline = ({
  items,
  startDate: customStartDate,
  endDate: customEndDate,
  className = '',
  lineColor = 'bg-fuchsia-700 dark:bg-fuchsia-500',
}: TimelineProps) => {
  // Sort by release date
  const sortedItems = [...items].sort(
    (a, b) => a.releaseDate.getTime() - b.releaseDate.getTime()
  )

  // Timeline range - always start from the first of the current month
  const currentDate = new Date()
  const startDate =
    customStartDate ||
    new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)

  // Create a date range that covers all items plus one year
  const latestItemDate = sortedItems.length
    ? sortedItems.reduce(
        (latest, item) =>
          item.releaseDate > latest ? item.releaseDate : latest,
        sortedItems[0].releaseDate
      )
    : new Date(currentDate)

  // Ensure we have at least one year range for display
  const endDate =
    customEndDate ||
    new Date(
      Math.max(
        latestItemDate.getTime(),
        new Date(startDate).setFullYear(startDate.getFullYear() + 1)
      )
    )

  // Generate month markers for the entire period
  const generateMonthMarkers = () => {
    const months = []

    // Start with the first day of the start month
    const firstMonthStart = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      1
    )

    // Add all months that fall within range
    const lastDate = new Date(endDate)

    const currentMonth = new Date(firstMonthStart)
    while (currentMonth <= lastDate) {
      months.push(new Date(currentMonth))
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }

    return months
  }

  const allMonthMarkers = generateMonthMarkers()

  // First row: first 6 months
  const firstHalfMonths = allMonthMarkers.slice(0, 6)

  // Second row: overlapping with first row by including the 6th month again
  // This ensures the 6th month appears in both rows and items in that month can be displayed in either row
  const secondRowStartIndex = Math.min(5, allMonthMarkers.length - 1) // Start from the 6th month (index 5)
  const secondRowEndIndex = Math.min(11, allMonthMarkers.length) // Go up to the 12th month
  const secondHalfMonths = allMonthMarkers.slice(
    secondRowStartIndex,
    secondRowEndIndex
  )

  // Calculate timeline position for an item (0-100%) for first row
  const getFirstRowPosition = (date: Date) => {
    if (firstHalfMonths.length === 0) return -1

    const rowStartDate = firstHalfMonths[0]

    // Get the last month in this row
    const lastMonth = firstHalfMonths[firstHalfMonths.length - 1]

    // Create a date for the last day of the last month in this row
    const rowEndDate = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth() + 1,
      0
    )

    const timeRange = rowEndDate.getTime() - rowStartDate.getTime()
    if (timeRange === 0) return 0

    // Check if date is in this row's range - include the full last month
    if (date < rowStartDate || date > rowEndDate) return -1

    // For day-accurate positioning within the month spans
    // Calculate the position based on the proportion of time elapsed in the range
    const exactPosition =
      ((date.getTime() - rowStartDate.getTime()) / timeRange) * 100

    // Interpolate position between month markers for more accurate day positioning
    // Find the month this date belongs to
    let monthIndex = -1
    for (let i = 0; i < firstHalfMonths.length; i++) {
      const currentMonth = firstHalfMonths[i]
      const nextMonthStart =
        i < firstHalfMonths.length - 1
          ? firstHalfMonths[i + 1]
          : new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)

      if (date >= currentMonth && date < nextMonthStart) {
        monthIndex = i
        break
      }
    }

    // If it's the last month in the row
    if (
      monthIndex === -1 &&
      date >= firstHalfMonths[firstHalfMonths.length - 1]
    ) {
      monthIndex = firstHalfMonths.length - 1
    }

    // If we found the month, calculate a more precise position
    if (monthIndex >= 0) {
      // Get positions of the current and next month markers
      const currentMonthPosition = getMonthMarkerPosition(
        monthIndex,
        firstHalfMonths
      )
      const nextMonthPosition =
        monthIndex < firstHalfMonths.length - 1
          ? getMonthMarkerPosition(monthIndex + 1, firstHalfMonths)
          : 100

      // Calculate start and end dates for interpolation
      const monthStart = firstHalfMonths[monthIndex]
      const monthEnd =
        monthIndex < firstHalfMonths.length - 1
          ? firstHalfMonths[monthIndex + 1]
          : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0) // Last day of month

      // Calculate position within the month
      const monthProgress =
        (date.getTime() - monthStart.getTime()) /
        (monthEnd.getTime() - monthStart.getTime())

      // Interpolate between month markers
      const interpolatedPosition =
        currentMonthPosition +
        monthProgress * (nextMonthPosition - currentMonthPosition)

      return Math.max(5, Math.min(95, interpolatedPosition)) // Clamp between 5% and 95%
    }

    // Fallback to original calculation
    return Math.max(5, Math.min(95, exactPosition)) // Clamp between 5% and 95%
  }

  // Calculate timeline position for an item (0-100%) for second row
  const getSecondRowPosition = (date: Date) => {
    if (secondHalfMonths.length === 0) return -1

    const rowStartDate = secondHalfMonths[0]

    // Get the last month in this row
    const lastMonth = secondHalfMonths[secondHalfMonths.length - 1]

    // Create a date for the last day of the last month in this row
    const rowEndDate = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth() + 1,
      0
    )

    const timeRange = rowEndDate.getTime() - rowStartDate.getTime()
    if (timeRange === 0) return 0

    // Check if date is in this row's range - include the full last month
    if (date < rowStartDate || date > rowEndDate) return -1

    // For day-accurate positioning within the month spans
    // Calculate the position based on the proportion of time elapsed in the range
    const exactPosition =
      ((date.getTime() - rowStartDate.getTime()) / timeRange) * 100

    // Interpolate position between month markers for more accurate day positioning
    // Find the month this date belongs to
    let monthIndex = -1
    for (let i = 0; i < secondHalfMonths.length; i++) {
      const currentMonth = secondHalfMonths[i]
      const nextMonthStart =
        i < secondHalfMonths.length - 1
          ? secondHalfMonths[i + 1]
          : new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)

      if (date >= currentMonth && date < nextMonthStart) {
        monthIndex = i
        break
      }
    }

    // If it's the last month in the row
    if (
      monthIndex === -1 &&
      date >= secondHalfMonths[secondHalfMonths.length - 1]
    ) {
      monthIndex = secondHalfMonths.length - 1
    }

    // If we found the month, calculate a more precise position
    if (monthIndex >= 0) {
      // Get positions of the current and next month markers
      const currentMonthPosition = getMonthMarkerPosition(
        monthIndex,
        secondHalfMonths
      )
      const nextMonthPosition =
        monthIndex < secondHalfMonths.length - 1
          ? getMonthMarkerPosition(monthIndex + 1, secondHalfMonths)
          : 100

      // Calculate start and end dates for interpolation
      const monthStart = secondHalfMonths[monthIndex]
      const monthEnd =
        monthIndex < secondHalfMonths.length - 1
          ? secondHalfMonths[monthIndex + 1]
          : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0) // Last day of month

      // Calculate position within the month
      const monthProgress =
        (date.getTime() - monthStart.getTime()) /
        (monthEnd.getTime() - monthStart.getTime())

      // Interpolate between month markers
      const interpolatedPosition =
        currentMonthPosition +
        monthProgress * (nextMonthPosition - currentMonthPosition)

      return Math.max(5, Math.min(95, interpolatedPosition)) // Clamp between 5% and 95%
    }

    // Fallback to original calculation
    return Math.max(5, Math.min(95, exactPosition)) // Clamp between 5% and 95%
  }

  // Filter items for each row, with special handling for the overlapping month
  const firstRowItems = sortedItems.filter((item) => {
    // First row gets items for the first 5 months, plus items from the first half of the 6th month
    const position = getFirstRowPosition(item.releaseDate)
    if (position < 0) return false

    // For items in the 6th month, we need to decide if they go in the first or second row
    if (
      firstHalfMonths.length === 6 && // We have at least 6 months
      secondHalfMonths.length > 0 && // We have a second row
      item.releaseDate >= firstHalfMonths[5]
    ) {
      // Item is in or after the 6th month

      // Check if this date is in the 6th month
      const sixthMonth = firstHalfMonths[5]
      const seventhMonthStart = new Date(
        sixthMonth.getFullYear(),
        sixthMonth.getMonth() + 1,
        1
      )

      if (
        item.releaseDate >= sixthMonth &&
        item.releaseDate < seventhMonthStart
      ) {
        // If it's in the 6th month, determine if it belongs in first or second row
        // Items in the first half of the month go to the first row
        const dayOfMonth = item.releaseDate.getDate()
        const lastDayOfMonth = new Date(
          sixthMonth.getFullYear(),
          sixthMonth.getMonth() + 1,
          0
        ).getDate()
        const midpoint = Math.ceil(lastDayOfMonth / 2)

        // Items in the second half of the month go to the second row
        if (dayOfMonth > midpoint) return false
      } else if (item.releaseDate >= seventhMonthStart) {
        // Items after the 6th month always go to the second row
        return false
      }
    }

    return true
  })

  const secondRowItems = sortedItems.filter((item) => {
    // Check if the item belongs to the second row
    const position = getSecondRowPosition(item.releaseDate)
    if (position < 0) return false

    // For items in the 6th month (which is duplicated), we need to decide where they go
    if (secondHalfMonths.length > 0 && firstHalfMonths.length === 6) {
      const sixthMonth = firstHalfMonths[5] // This is the same as secondHalfMonths[0]
      const seventhMonthStart =
        secondHalfMonths.length > 1
          ? secondHalfMonths[1]
          : new Date(sixthMonth.getFullYear(), sixthMonth.getMonth() + 1, 1)

      // If the item is in the 6th month, determine which row it belongs to
      if (
        item.releaseDate >= sixthMonth &&
        item.releaseDate < seventhMonthStart
      ) {
        const dayOfMonth = item.releaseDate.getDate()
        const lastDayOfMonth = new Date(
          sixthMonth.getFullYear(),
          sixthMonth.getMonth() + 1,
          0
        ).getDate()
        const midpoint = Math.ceil(lastDayOfMonth / 2)

        // Items in the first half of the month go to the first row, not the second
        if (dayOfMonth <= midpoint) return false
      }
    }

    return true
  })

  return (
    <div className={`${className}`}>
      {/* First row */}
      <TimelineRow
        monthMarkers={firstHalfMonths}
        getItemPosition={getFirstRowPosition}
        itemsToShow={firstRowItems}
        lineColor={lineColor}
      />

      {/* Second row */}
      {secondHalfMonths.length > 0 && (
        <TimelineRow
          monthMarkers={secondHalfMonths}
          getItemPosition={getSecondRowPosition}
          itemsToShow={secondRowItems}
          lineColor={lineColor}
        />
      )}
    </div>
  )
}
// Position month markers evenly from 0% to 100%
const getMonthMarkerPosition = (index: number, months: Date[]) => {
  // Early return for empty or single-month arrays
  if (months.length <= 1) return 0

  // For consistent visual display, we maintain equal spacing between month markers
  // This approach ensures the timeline looks orderly, with months evenly spaced
  return (index / (months.length - 1)) * 100
}

// Create a timeline row component for reuse
const TimelineRow = ({
  monthMarkers,
  getItemPosition,
  itemsToShow,
  lineColor,
}: {
  monthMarkers: Date[]
  getItemPosition: (date: Date) => number
  itemsToShow: TimelineItemData[]
  lineColor: string
}) => {
  return (
    <div className="relative mb-40 sm:mb-48">
      {/* Container for timeline and item icons */}
      <div className="relative w-full px-8">
        {/* Items on the timeline */}
        <div className="absolute left-0 right-0 top-[-30px] h-[80px] w-full overflow-visible sm:top-[-40px] sm:h-[90px]">
          {(() => {
            // Get all visible items for this row
            const visibleItems = filterDefined(
              itemsToShow.map((item) => {
                const position = getItemPosition(item.releaseDate)
                if (position < 0 || position > 100) return null

                return { item, position, verticalOffset: 0 }
              })
            ).sort((a, b) => a.position - b.position)

            // Detect and resolve collisions with three rows of offsets
            for (let i = 1; i < visibleItems.length; i++) {
              const current = visibleItems[i]
              let hasCollision = false
              const usedOffsets = new Set()

              // Check against all previous items
              for (let j = 0; j < i; j++) {
                const previous = visibleItems[j]

                // If items are less than 15% apart
                if (Math.abs(current.position - previous.position) < 23) {
                  hasCollision = true
                  // Track which offset levels are already used by nearby items
                  usedOffsets.add(previous.verticalOffset)
                }
              }

              // If there's a collision, find an available offset level
              if (hasCollision) {
                // Try each offset level (0, -25, -50, -75) until we find an unused one
                for (let offsetLevel = 0; offsetLevel <= 4; offsetLevel++) {
                  const offset = -25 * offsetLevel
                  if (!usedOffsets.has(offset)) {
                    current.verticalOffset = offset
                    break
                  }
                }
              }
            }

            // Render the items with adjusted positions
            return visibleItems.map(({ item, position, verticalOffset }) => (
              <TimelineItem
                key={`${item.title}-${item.releaseDate.getTime()}`}
                item={item}
                position={position}
                verticalOffset={verticalOffset}
                lineColor={lineColor}
              />
            ))
          })()}
        </div>

        {/* Timeline content */}
        <div className="relative w-full">
          {/* Month markers and labels */}
          <div className="absolute left-0 right-0 top-[15px]">
            {monthMarkers.map((date, index) => {
              const position = getMonthMarkerPosition(index, monthMarkers)

              return (
                <div
                  key={formatDateFn(date, 'yyyy-MM')}
                  className="absolute"
                  style={{
                    left: `${position}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {/* Month label positioned below the timeline */}
                  <div className="text-xxs mb-2 whitespace-nowrap text-center text-gray-600 dark:text-gray-400 sm:text-sm">
                    {formatDateFn(date, 'MMM yyyy')}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Timeline line */}
          <div
            className={`absolute left-0 right-0 h-1 ${lineColor} top-0`}
          ></div>

          {/* Tick marks */}
          <div className="absolute left-0 right-0 top-0">
            {monthMarkers.map((date, index) => {
              const position = getMonthMarkerPosition(index, monthMarkers)

              return (
                <div
                  key={`tick-${formatDateFn(date, 'yyyy-MM')}`}
                  className="absolute"
                  style={{
                    left: `${position}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {/* Tick marks */}
                  <div className={`h-3 w-0.5 ${lineColor} -mt-1`}></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
