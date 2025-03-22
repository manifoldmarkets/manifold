import React from 'react'
import { format as formatDateFn } from 'date-fns'
import { TimelineItem } from './timeline-item'

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
  lineColor = 'bg-fuchsia-700 dark:bg-fuchsia-500'
}: TimelineProps) => {
  // Sort by release date
  const sortedItems = [...items].sort((a, b) => a.releaseDate.getTime() - b.releaseDate.getTime())
  
  // Timeline range - always start from the first of the current month
  const currentDate = new Date()
  const startDate = customStartDate || new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
  
  // Create a date range that covers all items plus one year
  const latestItemDate = sortedItems.length ? 
    sortedItems.reduce((latest, item) => 
      item.releaseDate > latest ? item.releaseDate : latest, 
      sortedItems[0].releaseDate
    ) : new Date(currentDate)
  
  // Ensure we have at least one year range for display
  const endDate = customEndDate || new Date(
    Math.max(
      latestItemDate.getTime(), 
      new Date(startDate).setFullYear(startDate.getFullYear() + 1)
    )
  )
  
  // Generate month markers for the entire period
  const generateMonthMarkers = () => {
    const months = []
    
    // Start with the first day of the start month
    const firstMonthStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    
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
  
  // Second row: next 6 months
  const secondRowStartIndex = Math.min(6, allMonthMarkers.length)
  const secondRowEndIndex = Math.min(12, allMonthMarkers.length)
  const secondHalfMonths = allMonthMarkers.slice(secondRowStartIndex, secondRowEndIndex)
  
  // Calculate timeline position for an item (0-100%) for first row
  const getFirstRowPosition = (date: Date) => {
    if (firstHalfMonths.length === 0) return -1
    
    const rowStartDate = firstHalfMonths[0]
    const rowEndDate = new Date(firstHalfMonths[firstHalfMonths.length - 1])
    rowEndDate.setMonth(rowEndDate.getMonth() + 1) // End of the last month
    
    const timeRange = rowEndDate.getTime() - rowStartDate.getTime()
    if (timeRange === 0) return 0
    
    // Check if date is in this row's range
    if (date < rowStartDate || date > rowEndDate) return -1
    
    // Calculate position as percentage
    const position = ((date.getTime() - rowStartDate.getTime()) / timeRange) * 100
    return Math.max(5, Math.min(95, position)) // Clamp between 5% and 95%
  }
  
  // Calculate timeline position for an item (0-100%) for second row
  const getSecondRowPosition = (date: Date) => {
    if (secondHalfMonths.length === 0) return -1
    
    const rowStartDate = secondHalfMonths[0]
    const rowEndDate = new Date(secondHalfMonths[secondHalfMonths.length - 1])
    rowEndDate.setMonth(rowEndDate.getMonth() + 1) // End of the last month
    
    const timeRange = rowEndDate.getTime() - rowStartDate.getTime()
    if (timeRange === 0) return 0
    
    // Check if date is in this row's range
    if (date < rowStartDate || date > rowEndDate) return -1
    
    // Calculate position as percentage
    const position = ((date.getTime() - rowStartDate.getTime()) / timeRange) * 100
    return Math.max(5, Math.min(95, position)) // Clamp between 5% and 95%
  }
  
  // Simple function for positioning month markers evenly
  const getMonthMarkerPosition = (index: number, totalMonths: number) => {
    // Distribute all months evenly from 0% to 100%
    return (index / (totalMonths - 1)) * 100;
  }
  
  // Create a timeline row component for reuse
  const TimelineRow = ({
    monthMarkers,
    getItemPosition,
    itemsToShow
  }: {
    monthMarkers: Date[]
    getItemPosition: (date: Date) => number
    itemsToShow: TimelineItemData[]
  }) => {
    return (
      <div className="relative mb-24 sm:mb-32">
        {/* Container for timeline and item icons */}
        <div className="relative w-full px-8">
          {/* Items on the timeline */}
          <div className="absolute left-0 right-0 top-[-30px] sm:top-[-40px] w-full h-[30px] sm:h-[40px] overflow-visible">
            {(() => {
              // Get all visible items for this row
              const visibleItems = itemsToShow
                .map(item => {
                  const position = getItemPosition(item.releaseDate)
                  if (position < 0 || position > 100) return null
                  
                  return { item, position, verticalOffset: 0 }
                })
                .filter(item => item !== null)
                .sort((a, b) => a.position - b.position) // Sort by position
              
              // Detect and resolve collisions
              for (let i = 0; i < visibleItems.length - 1; i++) {
                const current = visibleItems[i]
                const next = visibleItems[i + 1]
                
                // If items are less than 15% apart
                if (next.position - current.position < 15) {
                  next.verticalOffset = i % 2 === 0 ? -25 : 25
                }
              }
              
              // Render the items with adjusted positions
              return visibleItems.map(({ item, position, verticalOffset }) => (
                <TimelineItem
                  key={`${item.title}-${item.releaseDate.getTime()}`}
                  item={item}
                  position={position}
                  verticalOffset={verticalOffset}
                />
              ))
            })()}
          </div>
          
          {/* Timeline content */}
          <div className="relative w-full">
            {/* Month markers and labels */}
            <div className="absolute left-0 right-0 top-[15px]">
              {monthMarkers.map((date, index) => {
                const position = getMonthMarkerPosition(index, monthMarkers.length)
                
                return (
                  <div 
                    key={formatDateFn(date, 'yyyy-MM')} 
                    className="absolute"
                    style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                  >
                    {/* Month label positioned below the timeline */}
                    <div className="text-xxs sm:text-sm text-gray-600 dark:text-gray-400 text-center whitespace-nowrap mb-2">
                      {formatDateFn(date, 'MMM yyyy')}
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Timeline line */}
            <div className={`absolute left-0 right-0 h-1 ${lineColor} top-0`}></div>
            
            {/* Tick marks */}
            <div className="absolute left-0 right-0 top-0">
              {monthMarkers.map((date, index) => {
                const position = getMonthMarkerPosition(index, monthMarkers.length)
                
                return (
                  <div 
                    key={`tick-${formatDateFn(date, 'yyyy-MM')}`} 
                    className="absolute"
                    style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
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

  // Filter items for each row
  const firstRowItems = sortedItems.filter(item => {
    return getFirstRowPosition(item.releaseDate) >= 0
  })
  
  const secondRowItems = sortedItems.filter(item => {
    return getSecondRowPosition(item.releaseDate) >= 0
  })

  return (
    <div className={`${className}`}>
      {/* First row */}
      <TimelineRow 
        monthMarkers={firstHalfMonths}
        getItemPosition={getFirstRowPosition}
        itemsToShow={firstRowItems}
      />
      
      {/* Second row */}
      {secondHalfMonths.length > 0 && (
        <TimelineRow 
          monthMarkers={secondHalfMonths}
          getItemPosition={getSecondRowPosition}
          itemsToShow={secondRowItems}
        />
      )}
    </div>
  )
}