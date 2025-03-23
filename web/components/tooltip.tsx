import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { LuInfo } from 'react-icons/lu'

interface TooltipProps {
  title: string
  description: string
  preferredPlacement?: 'top' | 'right' | 'bottom' | 'left'
}

function Tooltip({ title, description, preferredPlacement = 'top' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipStyles, setTooltipStyles] = useState({
    top: 0,
    left: 0
  })
  const [arrowStyles, setArrowStyles] = useState({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Calculate position whenever visibility changes
  useEffect(() => {
    if (!isVisible || !buttonRef.current) return

    const buttonRect = buttonRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Get tooltip dimensions
    const tooltipWidth = tooltipRef.current?.offsetWidth || 250
    const tooltipHeight = tooltipRef.current?.offsetHeight || 100

    // Initial positioning based on preferred placement
    let top = 0
    let left = 0
    let arrowStyle = {}

    switch (preferredPlacement) {
      case 'top':
        top = buttonRect.top - tooltipHeight - 10
        left = buttonRect.left + buttonRect.width / 2 - tooltipWidth / 2
        arrowStyle = { 
          bottom: -5, 
          left: '50%', 
          transform: 'translateX(-50%) rotate(45deg)'
        }
        break

      case 'bottom':
        top = buttonRect.bottom + 10
        left = buttonRect.left + buttonRect.width / 2 - tooltipWidth / 2
        arrowStyle = { 
          top: -5, 
          left: '50%', 
          transform: 'translateX(-50%) rotate(45deg)'
        }
        break

      case 'left':
        top = buttonRect.top + buttonRect.height / 2 - tooltipHeight / 2
        left = buttonRect.left - tooltipWidth - 10
        arrowStyle = { 
          right: -5, 
          top: '50%', 
          transform: 'translateY(-50%) rotate(45deg)'
        }
        break

      case 'right':
        top = buttonRect.top + buttonRect.height / 2 - tooltipHeight / 2
        left = buttonRect.right + 10
        arrowStyle = { 
          left: -5, 
          top: '50%', 
          transform: 'translateY(-50%) rotate(45deg)'
        }
        break

      default:
        top = buttonRect.top - tooltipHeight - 10
        left = buttonRect.left + buttonRect.width / 2 - tooltipWidth / 2
        arrowStyle = { 
          bottom: -5, 
          left: '50%', 
          transform: 'translateX(-50%) rotate(45deg)'
        }
    }

    // Adjust if tooltip would overflow viewport
    if (left < 10) {
      // Adjust position of arrow when alignment is adjusted
      if (preferredPlacement === 'top' || preferredPlacement === 'bottom') {
        left = 10
        arrowStyle = {
          ...arrowStyle,
          left: buttonRect.left + buttonRect.width / 2 - left
        }
      } else {
        left = 10
      }
    } else if (left + tooltipWidth > viewportWidth - 10) {
      // Adjust position of arrow when alignment is adjusted
      if (preferredPlacement === 'top' || preferredPlacement === 'bottom') {
        left = viewportWidth - tooltipWidth - 10
        arrowStyle = {
          ...arrowStyle,
          left: buttonRect.left + buttonRect.width / 2 - left
        }
      } else {
        left = viewportWidth - tooltipWidth - 10
      }
    }

    if (top < 10) {
      if (preferredPlacement === 'left' || preferredPlacement === 'right') {
        top = 10
        arrowStyle = {
          ...arrowStyle,
          top: buttonRect.top + buttonRect.height / 2 - top
        }
      } else {
        top = 10
      }
    } else if (top + tooltipHeight > viewportHeight - 10) {
      if (preferredPlacement === 'left' || preferredPlacement === 'right') {
        top = viewportHeight - tooltipHeight - 10
        arrowStyle = {
          ...arrowStyle,
          top: buttonRect.top + buttonRect.height / 2 - top
        }
      } else {
        top = viewportHeight - tooltipHeight - 10
      }
    }

    // Handle scroll by hiding tooltip
    const handleScroll = () => {
      if (isVisible) {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    setTooltipStyles({ top, left })
    setArrowStyles(arrowStyle)

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isVisible, preferredPlacement])

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-ink-500 hover:text-primary-600 transition-colors focus:outline-none"
        aria-label={`Info about ${title}`}
        aria-expanded={isVisible}
      >
        <LuInfo className="w-[12px] h-[12px] sm:w-[16px] sm:h-[16px]" />
      </button>
      
      {isVisible && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: tooltipStyles.top,
            left: tooltipStyles.left,
            pointerEvents: 'none'
          }}
          className="w-64 max-w-xs bg-canvas-0 shadow-lg rounded-md border border-ink-200 p-3 text-sm text-ink-700"
          role="tooltip"
        >
          <div
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              backgroundColor: 'white',
              ...arrowStyles
            }}
          />
          <h4 className="font-medium mb-1">{title}</h4>
          <p>{description}</p>
        </div>,
        document.body
      )}
    </>
  )
}

export default Tooltip