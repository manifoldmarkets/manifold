import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import { useRef, useState } from 'react'

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
      className="border-ink-200 dark:border-ink-300 bg-canvas-50 relative mt-3 h-80 overflow-hidden rounded-xl border"
    >
      <div
        ref={slides}
        aria-label="Image slides"
        className="scrollbar-hide flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onScroll={(e) => {
          const el = e.currentTarget
          if (el.clientWidth)
            setActive(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {images.map((url, index) => (
          <a
            key={`${index}-${url}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative h-full w-full shrink-0 snap-center"
            aria-label={`Open image ${index + 1} of ${images.length}`}
          >
            <CarouselImage url={url} index={index} />
          </a>
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button
            aria-label="Previous image"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:invisible"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            aria-label="Next image"
            disabled={active === images.length - 1}
            onClick={() => goTo(active + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:invisible"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/60 px-2 py-1">
            {images.map((_, index) => (
              <button
                key={index}
                aria-label={`Show image ${index + 1}`}
                aria-current={active === index ? 'true' : undefined}
                onClick={() => goTo(index)}
                className="flex h-6 w-6 items-center justify-center"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active === index ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              </button>
            ))}
          </div>
          <span aria-live="polite" className="sr-only">
            Image {active + 1} of {images.length}
          </span>
        </>
      )}
    </div>
  )
}

function CarouselImage({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <span className="text-ink-600 flex h-full items-center justify-center text-sm">
      Image unavailable
    </span>
  ) : (
    <img
      src={url}
      alt={`Attachment ${index + 1}`}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-contain"
      onError={() => setFailed(true)}
    />
  )
}
