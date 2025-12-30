import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'

import { useEvent } from 'client-common/hooks/use-event'
import { Answer } from 'common/answer'
import { ChartPosition } from 'common/chart-position'
import { formatWithToken } from 'common/util/format'
import {
  ControlledCarousel,
  useCarousel,
} from 'web/components/widgets/carousel'
import { useIsClient } from 'web/hooks/use-is-client'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Tooltip } from '../widgets/tooltip'

export const ChartPositionsCarousel = (props: {
  positions: ChartPosition[]
  hoveredPosition?: ChartPosition | null
  setHoveredPosition?: (position: ChartPosition | null) => void
  answers?: Answer[]
}) => {
  const { positions, hoveredPosition, setHoveredPosition, answers } = props
  const [carouselRef, setCarouselRef] = useState<HTMLDivElement | null>(null)
  const { onScroll, scrollLeft, scrollRight, atFront, atBack } =
    useCarousel(carouselRef)

  if (positions.length === 0) return null

  return (
    <ControlledCarousel
      className={clsx('relative', 'max-w-full gap-1')}
      ref={setCarouselRef}
      onScroll={onScroll}
      scrollLeft={scrollLeft}
      scrollRight={scrollRight}
      atFront={atFront}
      atBack={atBack}
    >
      {positions.map((p) => (
        <ChartPositionCard
          key={p.id}
          position={p}
          hovered={p.id === hoveredPosition?.id}
          setHoveredPosition={setHoveredPosition}
          carouselRef={carouselRef}
          answers={answers}
        />
      ))}
    </ControlledCarousel>
  )
}

const ChartPositionCard = (props: {
  position: ChartPosition
  hovered: boolean
  setHoveredPosition?: (position: ChartPosition | null) => void
  carouselRef: HTMLDivElement | null
  answers?: Answer[]
}) => {
  const { position, hovered, carouselRef, setHoveredPosition, answers } = props
  const { amount, createdTime, answerId, contract, outcome } = position

  const isBuy = amount > 0
  const isCashContract = contract.token === 'CASH'
  const answer = answers?.find((a) => a.id === answerId)
  // Trend up: buying YES or selling NO (bullish). Trend down: selling YES or buying NO (bearish)
  const isTrendUp = (isBuy && outcome === 'YES') || (!isBuy && outcome === 'NO')

  const ref = useRef<HTMLDivElement>(null)
  const isClient = useIsClient()

  const scrollIntoView = useEvent(() => {
    const card = ref.current
    if (!hovered || !carouselRef || !card) return

    const cardLeft = card.offsetLeft
    const cardWidth = card.offsetWidth
    const carouselScrollLeft = carouselRef.scrollLeft
    const carouselWidth = carouselRef.offsetWidth

    const cardRight = cardLeft + cardWidth
    const scrollRight = carouselScrollLeft + carouselWidth

    if (cardLeft < carouselScrollLeft) {
      carouselRef.scroll({ left: cardLeft, behavior: 'smooth' })
    } else if (cardRight > scrollRight) {
      carouselRef.scroll({
        left: cardRight - carouselWidth,
        behavior: 'smooth',
      })
    }
  })

  useEffect(() => {
    if (hovered) scrollIntoView()
  }, [hovered])

  return (
    <Col
      className={clsx(
        'w-[175px] cursor-pointer rounded-md border-2 p-2 transition-colors',
        hovered ? 'border-indigo-600' : 'dark:border-ink-500 border-ink-200'
      )}
      ref={ref}
      onMouseOver={() => setHoveredPosition?.(position)}
      onMouseLeave={() => setHoveredPosition?.(null)}
    >
      <Row className={'items-center gap-2'}>
        {isTrendUp ? (
          <FaArrowTrendUp className={'h-4 w-4 shrink-0 text-green-500'} />
        ) : (
          <FaArrowTrendDown className={'h-4 w-4 shrink-0 text-red-500'} />
        )}
        <span className={'whitespace-nowrap text-sm font-semibold'}>
          {isBuy ? 'Bought' : 'Sold'}{' '}
          {formatWithToken({
            amount: Math.abs(amount),
            token: isCashContract ? 'CASH' : 'M$',
          })}{' '}
          <span
            className={outcome === 'YES' ? 'text-green-500' : 'text-red-500'}
          >
            {outcome === 'YES' ? 'Yes' : 'No'}
          </span>
        </span>
      </Row>
      {answer && (
        <span
          className={'mt-1 truncate text-xs'}
          style={{ color: position.color }}
        >
          {answer.text}
        </span>
      )}
      <Tooltip
        className="w-fit"
        text={new Date(createdTime).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
        })}
      >
        <span className={'text-ink-500 mt-1 text-xs'}>
          {isClient &&
            new Date(createdTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
        </span>
      </Tooltip>
    </Col>
  )
}
