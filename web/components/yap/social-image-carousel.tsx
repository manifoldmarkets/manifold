import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { ExpandableImage } from 'web/components/widgets/expandable-image'

export function SocialImageCarousel({ images }: { images: string[] }) {
  const slides = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const goTo = (index: number) => {
    const el = slides.current
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
  }
  return (
    <div
      role="region"
      aria-label="Post images"
      aria-roledescription="carousel"
      data-social-images
      className="mt-3"
    >
      <div
        ref={slides}
        aria-label="Image slides"
        className="scrollbar-hide flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain"
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.clientWidth)
            setActive(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {images.map((url, index) => (
          <div
            key={`${index}-${url}`}
            aria-hidden={index !== active}
            className={clsx(
              'flex w-full shrink-0 snap-center',
              images.length > 1 && 'justify-center',
              // Only the selected image sets the height of the swipe track.
              index !== active && 'h-0'
            )}
          >
            <CarouselImage
              url={url}
              index={index}
              count={images.length}
              active={index === active}
            />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1">
          <button
            type="button"
            aria-label="Previous image"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
            className="text-ink-600 hover:bg-canvas-100 rounded-full p-1 disabled:invisible"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          {images.map((_, index) => (
            <button
              type="button"
              key={index}
              aria-label={`Show image ${index + 1}`}
              aria-current={active === index ? 'true' : undefined}
              onClick={() => goTo(index)}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  active === index ? 'bg-ink-700' : 'bg-ink-300'
                }`}
              />
            </button>
          ))}
          <button
            type="button"
            aria-label="Next image"
            disabled={active === images.length - 1}
            onClick={() => goTo(active + 1)}
            className="text-ink-600 hover:bg-canvas-100 rounded-full p-1 disabled:invisible"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <span aria-live="polite" className="sr-only">
            Image {active + 1} of {images.length}
          </span>
        </div>
      )}
    </div>
  )
}

function CarouselImage(props: {
  url: string
  index: number
  count: number
  active: boolean
}) {
  const { url, index, count, active } = props
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span className="text-ink-600 text-sm">Image unavailable</span>
  ) : (
    <ExpandableImage
      src={url}
      alt={`Attachment ${index + 1}`}
      buttonLabel={`Expand image ${index + 1} of ${count}`}
      tabIndex={active ? 0 : -1}
      decoding="async"
      className="block h-auto max-h-80 max-w-full rounded-xl"
      onError={() => setFailed(true)}
    />
  )
}
