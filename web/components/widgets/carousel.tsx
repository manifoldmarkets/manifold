import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { throttle } from 'lodash'
import { useState, useEffect, forwardRef, useRef, Ref, ReactNode } from 'react'
import { Row } from '../layout/row'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'

export function Carousel(props: {
  children: ReactNode
  loadMore?: () => void
  className?: string
  labelsParentClassName?: string
  fadeEdges?: boolean
}) {
  const { children, labelsParentClassName, loadMore, className, fadeEdges } =
    props

  const ref = useRef<HTMLDivElement>(null)

  const { scrollLeft, scrollRight, atFront, atBack, onScroll } = useCarousel(
    ref.current
  )

  useEffect(onScroll, [children])

  return (
    <div className={clsx('relative', className)}>
      <div
        className={clsx(
          fadeEdges && {
            'before:from-canvas-50 before:absolute before:left-0 before:top-0 before:z-10 before:h-full before:w-8 before:bg-gradient-to-r before:to-transparent':
              !atFront,
            'after:from-canvas-50 after:absolute after:right-0 after:top-0 after:z-10 after:h-full after:w-8 after:bg-gradient-to-l after:to-transparent':
              !atBack,
          }
        )}
      >
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
      </div>
      {!fadeEdges && !atFront && (
        <div
          className="hover:bg-ink-100/70 group absolute bottom-0 left-0 top-0 z-10 flex w-10 cursor-pointer select-none items-center justify-center transition-colors"
          onMouseDown={scrollLeft}
        >
          <ChevronLeftIcon className="bg-primary-50 text-primary-800 h-7 w-7 rounded-full transition-colors group-hover:bg-transparent" />
        </div>
      )}
      {!fadeEdges && !atBack && (
        <div
          className="hover:bg-ink-100/70 group absolute bottom-0 right-0 top-0 z-10 flex w-10 cursor-pointer select-none items-center justify-center transition-colors"
          onMouseDown={scrollRight}
        >
          <ChevronRightIcon className="bg-primary-50 text-primary-800 h-7 w-7 rounded-full transition-colors group-hover:bg-transparent" />
        </div>
      )}
    </div>
  )
}

export const ControlledCarousel = forwardRef(function (
  props: {
    children: ReactNode
    loadMore?: () => void
    className?: string
    labelsParentClassName?: string
    onScroll: () => void
    scrollLeft: () => void
    scrollRight: () => void
    atFront: boolean
    atBack: boolean
    fadeEdges?: boolean
  },
  current: Ref<HTMLDivElement>
) {
  const {
    children,
    labelsParentClassName,
    loadMore,
    className,
    onScroll,
    scrollLeft,
    scrollRight,
    atFront,
    atBack,
    fadeEdges,
  } = props

  return (
    <div className={clsx('relative', className)}>
      <div
        className={clsx(
          fadeEdges && {
            'before:from-canvas-50 before:absolute before:left-0 before:top-0 before:z-10 before:h-full before:w-8 before:bg-gradient-to-r before:to-transparent':
              !atFront,
            'after:from-canvas-50 after:absolute after:right-0 after:top-0 after:z-10 after:h-full after:w-8 after:bg-gradient-to-l after:to-transparent':
              !atBack,
          }
        )}
      >
        <Row
          className={clsx(
            'scrollbar-hide w-full snap-x overflow-x-auto scroll-smooth',
            labelsParentClassName ?? 'gap-4'
          )}
          ref={current}
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
      </div>
      {!fadeEdges && !atFront && (
        <div
          className="hover:bg-ink-100/70 group absolute bottom-0 left-0 top-0 z-10 flex w-10 cursor-pointer select-none items-center justify-center transition-colors"
          onMouseDown={scrollLeft}
        >
          <ChevronLeftIcon className="bg-primary-50 text-primary-800 h-7 w-7 rounded-full transition-colors group-hover:bg-transparent" />
        </div>
      )}
      {!fadeEdges && !atBack && (
        <div
          className="hover:bg-ink-100/70 group absolute bottom-0 right-0 top-0 z-10 flex w-10 cursor-pointer select-none items-center justify-center transition-colors"
          onMouseDown={scrollRight}
        >
          <ChevronRightIcon className="bg-primary-50 text-primary-800 h-7 w-7 rounded-full transition-colors group-hover:bg-transparent" />
        </div>
      )}
    </div>
  )
})

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
  const onScroll = () => {
    if (carouselRef) {
      const { scrollLeft, clientWidth, scrollWidth } = carouselRef
      setAtFront(scrollLeft < 60)
      setAtBack(scrollWidth - (clientWidth + scrollLeft) < 60)
    }
  }
  return {
    scrollLeft,
    scrollRight,
    atFront,
    atBack,
    onScroll,
  }
}
