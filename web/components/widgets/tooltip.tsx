import {
  arrow,
  autoUpdate,
  flip,
  offset,
  Placement,
  safePolygon,
  shift,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { Transition } from '@headlessui/react'
import clsx from 'clsx'
import { createPortal } from 'react-dom'
import { LuInfo } from 'react-icons/lu'
import { ReactNode, useRef, useState, useEffect } from 'react'

// See https://floating-ui.com/docs/react-dom

type TooltipProps = {
  text: string | false | undefined | null | ReactNode
  children: ReactNode
  className?: string
  tooltipClassName?: string
  placement?: Placement
  noTap?: boolean
  noFade?: boolean
  hasSafePolygon?: boolean
  suppressHydrationWarning?: boolean
  autoHideDuration?: number
}

export function Tooltip({
  text,
  children,
  className,
  tooltipClassName,
  placement = 'top',
  noTap,
  noFade,
  hasSafePolygon,
  suppressHydrationWarning,
  autoHideDuration,
}: TooltipProps) {
  const arrowRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open && autoHideDuration) {
      const timer = setTimeout(() => {
        setOpen(false)
      }, autoHideDuration)
      return () => clearTimeout(timer)
    }
  }, [open, autoHideDuration, text])

  const { refs, floatingStyles, middlewareData, context, placement: actualPlacement } =
    useFloating({
      open,
      onOpenChange: setOpen,
      whileElementsMounted: autoUpdate,
      placement,
      middleware: [
        offset(8),
        flip(),
        shift({ padding: 4 }),
        arrow({ element: arrowRef }),
      ],
    })

  const { x: arrowX, y: arrowY } = middlewareData.arrow ?? {}

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, {
      mouseOnly: noTap,
      handleClose: hasSafePolygon ? safePolygon({ buffer: -0.5 }) : null,
    }),
    useRole(context, { role: 'label' }),
  ])
  
  // which side of tooltip arrow is on. like: if tooltip is top-left, arrow is on bottom of tooltip
  const arrowSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[actualPlacement.split('-')[0]] as string

  if (!text) return <>{children}</>

  return (
    <>
      <span
        suppressHydrationWarning={suppressHydrationWarning}
        className={className}
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        {children}
      </span>
      <Transition
        show={open}
        enter="transition-opacity ease-out duration-50"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave={noFade ? '' : 'transition-opacity ease-in duration-150'}
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        as="div"
        role="tooltip"
        ref={refs.setFloating}
        style={floatingStyles}
        className={clsx(
          'text-ink-0 bg-ink-700 z-20 w-max max-w-xs whitespace-normal rounded px-2 py-1 text-center text-sm font-medium',
          tooltipClassName
        )}
        suppressHydrationWarning={suppressHydrationWarning}
        {...getFloatingProps()}
      >
        {text}
        <div
          ref={arrowRef}
          className="bg-ink-700 absolute h-2 w-2 rotate-45"
          style={{
            top: arrowY != null ? arrowY : '',
            left: arrowX != null ? arrowX : '',
            right: '',
            bottom: '',
            [arrowSide]: '-4px',
          }}
        />
      </Transition>
    </>
  )
}

interface DashboardTooltipProps {
  title: string
  description: string
  preferredPlacement?: 'top' | 'right' | 'bottom' | 'left'
}

function DashboardTooltip({ 
  title, 
  description, 
  preferredPlacement = 'top' 
}: DashboardTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipStyles, setTooltipStyles] = useState({ top: 0, left: 0 })
  const [arrowStyles, setArrowStyles] = useState({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const toggleVisibility = () => setIsVisible(!isVisible)
  const show = () => setIsVisible(true)
  const hide = () => setIsVisible(false)

  // Calculate position whenever visibility changes
  useEffect(() => {
    if (!isVisible || !buttonRef.current) return

    const calculatePosition = () => {
      const buttonRect = buttonRef.current!.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      const tooltipWidth = tooltipRef.current?.offsetWidth || 250
      const tooltipHeight = tooltipRef.current?.offsetHeight || 100
      
      // Calculate available space in each direction
      const spaceTop = buttonRect.top
      const spaceBottom = viewportHeight - buttonRect.bottom
      const spaceLeft = buttonRect.left
      const spaceRight = viewportWidth - buttonRect.right
      
      // Determine actual placement based on available space
      let actualPlacement = preferredPlacement
      
      // If preferred placement is top but not enough space, use bottom
      if (preferredPlacement === 'top' && spaceTop < tooltipHeight + 10 && spaceBottom >= tooltipHeight + 10) {
        actualPlacement = 'bottom'
      }
      // If preferred placement is bottom but not enough space, use top
      else if (preferredPlacement === 'bottom' && spaceBottom < tooltipHeight + 10 && spaceTop >= tooltipHeight + 10) {
        actualPlacement = 'top'
      }
      // If preferred placement is left but not enough space, use right
      else if (preferredPlacement === 'left' && spaceLeft < tooltipWidth + 10 && spaceRight >= tooltipWidth + 10) {
        actualPlacement = 'right'
      }
      // If preferred placement is right but not enough space, use left
      else if (preferredPlacement === 'right' && spaceRight < tooltipWidth + 10 && spaceLeft >= tooltipWidth + 10) {
        actualPlacement = 'left'
      }
      
      // Initial positioning based on actual placement
      let top = 0
      let left = 0
      let arrowStyle = {}
      
      const positionByPlacement = {
        top: () => {
          top = buttonRect.top - tooltipHeight - 10
          left = buttonRect.left + buttonRect.width / 2 - tooltipWidth / 2
          arrowStyle = { 
            bottom: -5, 
            left: '50%', 
            transform: 'translateX(-50%) rotate(45deg)'
          }
        },
        bottom: () => {
          top = buttonRect.bottom + 10
          left = buttonRect.left + buttonRect.width / 2 - tooltipWidth / 2
          arrowStyle = { 
            top: -5, 
            left: '50%', 
            transform: 'translateX(-50%) rotate(45deg)'
          }
        },
        left: () => {
          top = buttonRect.top + buttonRect.height / 2 - tooltipHeight / 2
          left = buttonRect.left - tooltipWidth - 10
          arrowStyle = { 
            right: -5, 
            top: '50%', 
            transform: 'translateY(-50%) rotate(45deg)'
          }
        },
        right: () => {
          top = buttonRect.top + buttonRect.height / 2 - tooltipHeight / 2
          left = buttonRect.right + 10
          arrowStyle = { 
            left: -5, 
            top: '50%', 
            transform: 'translateY(-50%) rotate(45deg)'
          }
        }
      }
      
      // Position based on actual placement or default to top
      const placementFn = positionByPlacement[actualPlacement] || positionByPlacement.top
      placementFn()
      
      // Fine-tune horizontal position if needed (without changing the placement)
      if (left < 10) {
        const isVertical = actualPlacement === 'top' || actualPlacement === 'bottom'
        left = 10
        
        if (isVertical) {
          arrowStyle = {
            ...arrowStyle,
            left: buttonRect.left + buttonRect.width / 2 - left
          }
        }
      } else if (left + tooltipWidth > viewportWidth - 10) {
        const isVertical = actualPlacement === 'top' || actualPlacement === 'bottom'
        left = viewportWidth - tooltipWidth - 10
        
        if (isVertical) {
          arrowStyle = {
            ...arrowStyle,
            left: buttonRect.left + buttonRect.width / 2 - left
          }
        }
      }
      
      // Fine-tune vertical position if needed (without changing the placement)
      if (top < 10) {
        const isHorizontal = actualPlacement === 'left' || actualPlacement === 'right'
        top = 10
        
        if (isHorizontal) {
          arrowStyle = {
            ...arrowStyle,
            top: buttonRect.top + buttonRect.height / 2 - top
          }
        }
      } else if (top + tooltipHeight > viewportHeight - 10) {
        const isHorizontal = actualPlacement === 'left' || actualPlacement === 'right'
        top = viewportHeight - tooltipHeight - 10
        
        if (isHorizontal) {
          arrowStyle = {
            ...arrowStyle,
            top: buttonRect.top + buttonRect.height / 2 - top
          }
        }
      }
      
      setTooltipStyles({ top, left })
      setArrowStyles(arrowStyle)
    }

    calculatePosition()
    
    // Hide tooltip on scroll
    const handleScroll = () => {
      if (isVisible) hide()
    }
    
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [isVisible, preferredPlacement])

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={toggleVisibility}
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

export default DashboardTooltip