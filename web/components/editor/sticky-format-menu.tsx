import {
  PhotographIcon,
  CodeIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { Tooltip } from '../tooltip'
import { EmbedModal } from './embed-modal'
import { ImageModal } from './image-modal'
import { MarketModal } from './market-modal'

/* Toolbar, with buttons for images and embeds */
export function StickyFormatMenu(props: {
  editor: Editor | null
  children?: React.ReactNode
}) {
  const { editor, children } = props
  const upload = editor?.storage.upload.mutation

  const [imageOpen, setImageOpen] = useState(false)
  const [iframeOpen, setIframeOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)

  return (
    <div className="flex h-9 items-center gap-5 pl-4 pr-1">
      <Tooltip text="Add image" noTap noFade>
        <button
          type="button"
          onClick={() => setImageOpen(true)}
          className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500"
        >
          <ImageModal
            editor={editor}
            upload={upload}
            open={imageOpen}
            setOpen={setImageOpen}
          />
          <PhotographIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text="Add embed" noTap noFade>
        <button
          type="button"
          onClick={() => setIframeOpen(true)}
          className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500"
        >
          <EmbedModal
            editor={editor}
            open={iframeOpen}
            setOpen={setIframeOpen}
          />
          <CodeIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text="Add market" noTap noFade>
        <button
          type="button"
          onClick={() => setMarketOpen(true)}
          className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500"
        >
          <MarketModal
            editor={editor}
            open={marketOpen}
            setOpen={setMarketOpen}
          />
          <PresentationChartLineIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </Tooltip>
      {/* Spacer that also focuses editor on click */}
      <div
        className="grow cursor-text self-stretch"
        onMouseDown={() =>
          editor?.chain().focus('end').createParagraphNear().run()
        }
        aria-hidden
      />
      {children}
    </div>
  )
}
