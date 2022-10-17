import {
  CodeIcon,
  PhotographIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import React, { useState } from 'react'
import { Tooltip } from '../widgets/tooltip'
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
    <div className="text flex h-9 items-stretch border-t">
      <ToolbarButton label="Add image" onClick={() => setImageOpen(true)}>
        <ImageModal
          editor={editor}
          upload={upload}
          open={imageOpen}
          setOpen={setImageOpen}
        />
        <PhotographIcon className="h-5 w-5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton label="Add embed" onClick={() => setIframeOpen(true)}>
        <EmbedModal editor={editor} open={iframeOpen} setOpen={setIframeOpen} />
        <CodeIcon className="h-5 w-5" aria-hidden="true" />
      </ToolbarButton>
      <ToolbarButton label="Add market" onClick={() => setMarketOpen(true)}>
        <MarketModal
          editor={editor}
          open={marketOpen}
          setOpen={setMarketOpen}
        />
        <PresentationChartLineIcon className="h-5 w-5" aria-hidden="true" />
      </ToolbarButton>

      <div className="grow" />
      {children}
    </div>
  )
}

function ToolbarButton(props: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const { label, onClick, children } = props

  return (
    <Tooltip text={label} noTap noFade>
      <button
        type="button"
        onClick={onClick}
        className="active:bg-greyscale-3 hover:text-greyscale-6 flex h-full w-12 items-center justify-center text-gray-400 transition-colors"
      >
        {children}
      </button>
    </Tooltip>
  )
}
