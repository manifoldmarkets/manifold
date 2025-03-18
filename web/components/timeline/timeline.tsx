import React, { useState } from 'react'
import { format as formatDateFn } from 'date-fns'
import { MdChevronRight, MdChevronLeft } from "react-icons/md"
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
  
  const endDate = customEndDate || new Date(startDate)
  endDate.setMonth(startDate.getMonth() + 5) // 6 months total
    
  const latestItemDate = sortedItems.length ? 
    sortedItems.reduce((latest, item) => 
      item.releaseDate > latest ? item.releaseDate : latest, 
      sortedItems[0].releaseDate
    ) : endDate
  
  // Track scroll position with state
  const [timelineScrollPosition, setTimelineScrollPosition] = useState(0)
  
  // Handle scrolling forward in time
  const scrollForward = () => {
    const newStartDate = new Date(viewEndDate)
    
    if (newStartDate <= latestItemDate) {
      setTimelineScrollPosition(timelineScrollPosition + 5)
    }
  }
  
  // Handle scrolling backward in time
  const scrollBackward = () => {
    if (timelineScrollPosition > 0) {
      setTimelineScrollPosition(timelineScrollPosition - 5)
    }
  }
  
  const viewStartDate = new Date(startDate)
  viewStartDate.setMonth(startDate.getMonth() + timelineScrollPosition)
  
  const viewEndDate = new Date(viewStartDate)
  viewEndDate.setMonth(viewStartDate.getMonth() + 5) // 6 months total
  
  // Month markers based on actual date positions
  const generateMonthMarkers = () => {
    const months = []
    
    // Start with the first day of the visible start month
    const firstMonthStart = new Date(viewStartDate.getFullYear(), viewStartDate.getMonth(), 1)
    
    // Add all months that fall within view range
    const lastDate = new Date(viewEndDate)
    
    const currentMonth = new Date(firstMonthStart)
    while (currentMonth <= lastDate) {
      months.push(new Date(currentMonth))
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }
    
    return months
  }
  
  const monthMarkers = generateMonthMarkers()
  
  // Calculate position on timeline (0-100%) based on visible range
  const getTimelinePosition = (date: Date) => {
    const timeRange = viewEndDate.getTime() - viewStartDate.getTime()
    if (timeRange === 0) return 0
    
    // Calculate raw position as percentage
    const position = ((date.getTime() - viewStartDate.getTime()) / timeRange) * 100
    
    // Check if this date falls in the last month of our timeline
    const dateMonth = date.getMonth()
    const dateYear = date.getFullYear()
    const lastMonth = viewEndDate.getMonth()
    const lastYear = viewEndDate.getFullYear()
    const isInLastMonth = dateMonth === lastMonth && dateYear === lastYear
    
    // If this item is in the last month and we're on the first page,
    // don't show it (it will be shown on the second page)
    if (isInLastMonth && timelineScrollPosition === 0) {
      return -1
    }
    
    // Special handling for items that would appear at the beginning of the timeline
    // If the date is before our viewStartDate but within 14 days, position it at the start
    if (date.getTime() < viewStartDate.getTime()) {
      const daysDifference = (viewStartDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDifference <= 14) {
        // Place it at the very beginning of the timeline
        return 5;
      }
      return -1; // Otherwise don't show it
    }
    
    // If on second page, handle items that should be shown at the beginning
    if (timelineScrollPosition > 0) {
      // Calculate where this date would have been on the previous page
      const prevPageStartDate = new Date(startDate)
      prevPageStartDate.setMonth(prevPageStartDate.getMonth() + (timelineScrollPosition - 5))
      
      const prevPageEndDate = new Date(prevPageStartDate)
      prevPageEndDate.setMonth(prevPageStartDate.getMonth() + 5)
      
      const prevPageTimeRange = prevPageEndDate.getTime() - prevPageStartDate.getTime()
      const prevPagePosition = ((date.getTime() - prevPageStartDate.getTime()) / prevPageTimeRange) * 100
      
      // For items that were near the end of the previous page, show them at the beginning of this page
      if (prevPagePosition > 90 && prevPagePosition <= 100 && position < 0) {
        return 5 // Position at beginning of current page
      }
    }
    
    // Make sure items near the edges are clamped to reasonable values
    if (position >= 0 && position <= 100) {
      return Math.max(5, Math.min(95, position)); // Clamp between 5% and 95%
    } else {
      return -1; // Date is outside visible range
    }
  }
  
  // Simple function for positioning month markers evenly
  const getMonthMarkerPosition = (date: Date, index: number, totalMonths: number) => {
    // Distribute all months evenly from 0% to 100%
    return (index / (totalMonths - 1)) * 100;
  }

  return (
    <div className={`${className}`}>
      <div className="relative mb-8 mt-10 sm:mt-16">
        {/* Main container for timeline and item icons */}
        <div className="relative w-full px-8">
          {timelineScrollPosition > 0 && (
            <button 
              onClick={scrollBackward}
              className="absolute -left-6 top-[-20px] p-2 rounded-full text-primary-600 z-10"
              aria-label="Scroll backward in time"
            >
              <MdChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
          
          {viewEndDate < latestItemDate && (
            <button 
              onClick={scrollForward}
              className="absolute -right-6 top-[-20px] p-2 rounded-full text-primary-600 z-10"
              aria-label="Scroll forward in time"
            >
              <MdChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
        
          {/* Collision detection for icons*/}
          <div className="absolute left-0 right-0 top-[-45px] w-full h-[45px] overflow-visible">
            {(() => {
              // Get all visible items
              const visibleItems = sortedItems
                .map(item => {
                  const position = getTimelinePosition(item.releaseDate)

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
                  next.verticalOffset = i % 2 === 0 ? 25 : -25
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
                const position = getMonthMarkerPosition(date, index, monthMarkers.length)
                
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
                const position = getMonthMarkerPosition(date, index, monthMarkers.length)
                
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
    </div>
  )
}