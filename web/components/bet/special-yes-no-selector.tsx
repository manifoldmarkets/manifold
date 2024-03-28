import clsx from 'clsx'
import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/solid'

import { Row } from '../layout/row'
import { Button } from '../buttons/button'
import { useEffect, useRef, useState } from 'react'
import { useEvent } from 'web/hooks/use-event'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function SpecialYesNoSelector(props: {
  selected?: 'YES' | 'NO' | 'LIMIT' | undefined
  onSelect: (selected: 'YES' | 'NO') => void
  prob: number
  className?: string
  yesLabel?: string
  noLabel?: string
  disabled?: boolean
  highlight?: boolean
}) {
  const {
    selected,
    onSelect,
    prob,
    className,
    yesLabel,
    noLabel,
    disabled,
    highlight,
  } = props
  const aboveLimit = prob >= 0.99
  const nearlyAboveLimit = prob >= 0.98
  const belowLimit = prob <= 0.01
  const nearlyBelowLimit = prob <= 0.02
  const yesWidth = aboveLimit ? 0 : (1 - prob) * 100
  const noWidth = belowLimit ? 0 : prob * 100
  const yesFontSize = Math.min((20 * yesWidth) / 100, 20)
  const noFontSize = Math.min((20 * noWidth) / 100, 20)
  const yesButtonRef = useRef<HTMLButtonElement>(null)
  const noButtonRef = useRef<HTMLButtonElement>(null)
  const [hoveredOutcome, setHoveredOutcome] = useState<
    'YES' | 'NO' | undefined
  >(undefined)
  const returnIntervalId = useRef<NodeJS.Timeout | undefined>(undefined)
  const isMobile = useIsMobile()

  const animateDiv = useEvent(() => {
    const width = window.innerWidth
    const div =
      hoveredOutcome === 'NO' ? noButtonRef.current : yesButtonRef.current
    const centerX = div?.clientLeft ?? 0
    const centerY = div?.clientTop ?? 0
    if (!hoveredOutcome || !div || (prob < 0.6 && prob > 0.4)) return
    const speed = hoveredOutcome === 'YES' ? prob : 1 - prob
    const maxOffset = width * speed
    div.style.transition = `transform ${1 - speed}s ease-out`
    const randomX = Math.random() * (maxOffset * 2) - maxOffset
    const randomY = Math.random() * (maxOffset * 2) - maxOffset
    div.style.transform = `translate(${centerX + randomX}px, ${
      centerY + randomY
    }px)`
    // Calculate the delay duration based on the speed value
    const maxSpeed = isMobile ? 2500 : 1000
    const delay = Math.max(0, maxSpeed - speed * maxSpeed)

    // Use setTimeout to delay the next frame of the animation
    setTimeout(() => {
      requestAnimationFrame(() => animateDiv())
    }, delay)
  })

  // Trigger animation on hover
  useEffect(() => {
    if (!hoveredOutcome) return

    // Start the animation with an initial speed value (e.g., 0.5)
    animateDiv()
  }, [hoveredOutcome])

  // Return the buttons to their original position on hover out
  useEffect(() => {
    const yesButton = yesButtonRef.current
    const noButton = noButtonRef.current
    if (yesButton) {
      yesButton.style.transition = 'transform 5s ease-out'
    }
    if (noButton) {
      noButton.style.transition = 'transform 5s ease-out'
    }
    const returnButtonsToStart = () => {
      if (!hoveredOutcome) {
        // Move the buttons back to their original position
        if (yesButton) yesButton.style.transform = ''
        if (noButton) noButton.style.transform = ''
      } else if (hoveredOutcome === 'YES') {
        if (noButton) noButton.style.transform = ''
      } else if (hoveredOutcome === 'NO') {
        if (yesButton) yesButton.style.transform = ''
      }
    }

    returnIntervalId.current = setInterval(returnButtonsToStart, 1000)

    // Clean up the interval on component unmount
    return () => {
      clearInterval(returnIntervalId.current)
    }
  }, [hoveredOutcome])

  const onHover = (outcome: 'YES' | 'NO' | undefined) => {
    clearInterval(returnIntervalId.current)
    setHoveredOutcome(outcome)
  }

  const clearMobileHoverAfterDelay = useEvent((outcome: string) => {
    console.log('clearMobileHoverAfterDelay', outcome, hoveredOutcome)
    if (hoveredOutcome === outcome) setHoveredOutcome(undefined)
  })

  const onClick = useEvent((outcome: 'YES' | 'NO') => {
    console.log('onClick', 'outcome', outcome, 'hovered state', hoveredOutcome)
    if (isMobile && hoveredOutcome !== outcome) {
      setHoveredOutcome(outcome)
      setTimeout(() => {
        clearMobileHoverAfterDelay(outcome)
      }, 1000)
    } else if (isMobile && hoveredOutcome === outcome) {
      onSelect(outcome)
    } else {
      onSelect(outcome)
    }
  })
  return (
    <Row className={clsx('space-x-3', className)}>
      <Button
        onMouseEnter={() => onHover('YES')}
        onMouseLeave={() => onHover(undefined)}
        ref={yesButtonRef}
        color={
          (highlight && !selected) || selected === 'YES'
            ? 'green'
            : 'green-outline'
        }
        size="xl"
        style={
          prob
            ? {
                width: `${yesWidth}%`,
                fontSize: `${yesFontSize}px`,
              }
            : {}
        }
        onClick={() => onClick('YES')}
        className={clsx(
          aboveLimit ? '!p-1' : nearlyAboveLimit ? '!px-3' : '',
          selected === 'YES' && 'opacity-75',
          selected !== undefined ? '!rounded-full' : ''
        )}
        disabled={disabled}
      >
        {yesLabel ? yesLabel : 'YES'}
        <ArrowUpIcon
          style={{
            width: `${yesFontSize}px`,
          }}
          className="ml-1"
        />
      </Button>
      <Button
        onMouseEnter={() => onHover('NO')}
        onMouseLeave={() => onHover(undefined)}
        ref={noButtonRef}
        color={
          (highlight && !selected) || selected === 'NO' ? 'red' : 'red-outline'
        }
        size="xl"
        style={{
          width: `${noWidth}%`,
          fontSize: `${noFontSize}px`,
        }}
        onClick={() => onClick('NO')}
        className={clsx(
          belowLimit ? '!p-1' : nearlyBelowLimit ? '!px-3' : '',
          selected === 'NO' && 'opacity-75',
          selected !== undefined ? '!rounded-full' : ''
        )}
        disabled={disabled}
      >
        {noLabel ? noLabel : 'NO'}
        <ArrowDownIcon
          style={{
            width: `${noFontSize}px`,
          }}
          className="ml-1"
        />
      </Button>
    </Row>
  )
}
