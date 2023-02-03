import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { throttle } from 'lodash'
import { ReactNode, useRef, useState, useEffect } from 'react'
import { Row } from '../layout/row'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'

export function Carousel(props: {
  children: ReactNode
  loadMore?: () => void
  className?: string
}) {
  const { children, loadMore, className } = props

  const ref = useRef<HTMLDivElement>(null)

  const th = (f: () => any) => throttle(f, 500, { trailing: false })
  const scrollLeft = th(() =>
    ref.current?.scrollBy({ left: -ref.current.clientWidth })
  )
  const scrollRight = th(() =>
    ref.current?.scrollBy({ left: ref.current.clientWidth })
  )

  const [atFront, setAtFront] = useState(true)
  const [atBack, setAtBack] = useState(false)
  const onScroll = throttle(() => {
    if (ref.current) {
      const { scrollLeft, clientWidth, scrollWidth } = ref.current
      setAtFront(scrollLeft < 80)
      setAtBack(scrollWidth - (clientWidth + scrollLeft) < 80)
    }
  }, 500)

  useEffect(onScroll, [children])

  return (
    <div className={clsx('relative', className)}>
      <Row
        className="scrollbar-hide w-full snap-x gap-4 overflow-x-auto scroll-smooth"
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
          className="absolute left-0 top-0 bottom-0 z-10 flex w-10 cursor-pointer items-center justify-center hover:bg-indigo-100/30"
          onMouseDown={scrollLeft}
        >
          <ChevronLeftIcon className="h-7 w-7 rounded-full bg-indigo-50 text-indigo-700" />
        </div>
      )}
      {!atBack && (
        <div
          className="absolute right-0 top-0 bottom-0 z-10 flex w-10 cursor-pointer items-center justify-center hover:bg-indigo-100/30"
          onMouseDown={scrollRight}
        >
          <ChevronRightIcon className="h-7 w-7 rounded-full bg-indigo-50 text-indigo-700" />
        </div>
      )}
    </div>
  )
}
