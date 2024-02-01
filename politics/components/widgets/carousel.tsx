import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { throttle } from 'lodash'
import { useState, useEffect, forwardRef, useRef, Ref, ReactNode } from 'react'
import { Row } from 'web/components/layout/row'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'

export function Carousel(props: {
  children: ReactNode
  loadMore?: () => void
  className?: string
  labelsParentClassName?: string
}) {
  const { children, labelsParentClassName, loadMore, className } = props

  const ref = useRef<HTMLDivElement>(null)

  const { scrollLeft, scrollRight, atFront, atBack, onScroll } = useCarousel(
    ref.current
  )

  useEffect(onScroll, [children])

  return (
    <div className={clsx('relative', className)}>
      <Row
        className={clsx(
          'scrollbar-hide w-full snap-x overflow-x-auto scroll-smooth',
          labelsParentClassName ?? 'gap-4'
        )}
        ref={ref}
        onScroll={onScroll}
      >
        {children}

        {loadMore && (
          <VisibilityObserver
            className="relative -left-96"
            onVisibilityUpdated={(visible) => visible && loadMore()}
          />
        )}
      </Row>
      {!atFront && (
        <div
          className="group absolute bottom-0 left-0 top-0 z-10 flex w-6 cursor-pointer select-none items-center justify-center transition-colors"
          onMouseDown={scrollLeft}
        >
          <ChevronLeftIcon className="bg-canvas-0 group-hover:bg-ink-1000 group-hover:text-ink-0 border-ink-1000 h-6 w-6 border transition-colors" />
        </div>
      )}
      {!atBack && (
        <div
          className="group absolute bottom-0 right-0 top-0 z-10 flex w-6 cursor-pointer select-none items-center justify-center transition-colors"
          onMouseDown={scrollRight}
        >
          <ChevronRightIcon className=" bg-canvas-0 group-hover:bg-ink-1000 group-hover:text-ink-0 border-ink-1000 h-6 w-6 border transition-colors" />
        </div>
      )}
    </div>
  )
}

export const useCarousel = (carouselRef: HTMLDivElement | null) => {
  const th = (f: () => any) => throttle(f, 500, { trailing: false })
  const scrollLeft = th(() => {
    carouselRef?.scrollBy({ left: -(carouselRef.clientWidth - 80) })
  })
  const scrollRight = th(() => {
    carouselRef?.scrollBy({ left: carouselRef.clientWidth - 80 })
  })

  const [atFront, setAtFront] = useState(true)
  const [atBack, setAtBack] = useState(true)
  const onScroll = throttle(() => {
    if (carouselRef) {
      const { scrollLeft, clientWidth, scrollWidth } = carouselRef
      setAtFront(scrollLeft < 80)
      setAtBack(scrollWidth - (clientWidth + scrollLeft) < 80)
    }
  }, 500)
  return {
    scrollLeft,
    scrollRight,
    atFront,
    atBack,
    onScroll,
  }
}
