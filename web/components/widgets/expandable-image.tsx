import { Dialog } from '@headlessui/react'
import { XIcon } from '@heroicons/react/outline'
import { ComponentPropsWithoutRef, useState } from 'react'

type ExpandableImageProps = ComponentPropsWithoutRef<'img'> & {
  src: string
  buttonLabel?: string
}

export function ExpandableImage(props: ExpandableImageProps) {
  const {
    src,
    alt,
    title,
    referrerPolicy,
    buttonLabel,
    tabIndex,
    ...thumbnail
  } = props
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={
          buttonLabel ?? (alt ? `Expand image: ${alt}` : 'Expand image')
        }
        aria-haspopup="dialog"
        tabIndex={tabIndex}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setExpanded(true)
        }}
        className="min-w-0 max-w-full cursor-zoom-in self-start focus-visible:-outline-offset-2"
      >
        <img
          src={src}
          alt={alt ?? ''}
          title={title}
          referrerPolicy={referrerPolicy}
          loading="lazy"
          {...thumbnail}
        />
      </button>
      {expanded && (
        <Dialog
          open
          onClose={setExpanded}
          aria-label="Expanded image"
          className="fixed inset-0 z-50"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close expanded image"
            onClick={() => setExpanded(false)}
            className="flex h-full w-full cursor-zoom-out items-center justify-center bg-black/80"
          >
            <img
              src={src}
              alt={alt ?? ''}
              title={title}
              referrerPolicy={referrerPolicy}
              className="h-full w-full object-contain"
            />
            <XIcon className="absolute right-3 top-3 h-8 w-8 rounded-full bg-black/60 p-1.5 text-white" />
          </button>
        </Dialog>
      )}
    </>
  )
}
