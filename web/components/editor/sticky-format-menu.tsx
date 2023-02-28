import { CloudIcon, EmojiHappyIcon } from '@heroicons/react/outline'
import {
  CodeIcon,
  PhotographIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import React, { useState } from 'react'
import { FileUploadButton } from '../buttons/file-upload-button'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { EmbedModal } from './embed-modal'
import { DreamModal } from './image-modal'
import { MarketModal } from './market-modal'
import type { UploadMutation } from './upload-extension'

/* Toolbar, with buttons for images and embeds */
export function StickyFormatMenu(props: {
  editor: Editor | null
  children?: React.ReactNode
}) {
  const { editor, children } = props
  const upload = editor?.storage.upload.mutation

  const [dreamOpen, setDreamOpen] = useState(false)
  const [iframeOpen, setIframeOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)

  return (
    <div className="text border-ink-300 flex h-9 items-stretch border-t">
      <UploadButton upload={upload} />
      <ToolbarButton label="Add dream" onClick={() => setDreamOpen(true)}>
        <DreamModal editor={editor} open={dreamOpen} setOpen={setDreamOpen} />
        <CloudIcon className="h-5 w-5" aria-hidden />
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
      <ToolbarButton label="Add emoji" onClick={() => insertEmoji(editor)}>
        <EmojiHappyIcon className="h-5 w-5" />
      </ToolbarButton>

      <div className="grow" />
      {children}
    </div>
  )
}

function UploadButton(props: { upload: UploadMutation }) {
  const { upload } = props

  return (
    <Tooltip text="Upload image" noTap noFade className="w-12 flex-initial">
      <FileUploadButton
        onFiles={(files) => upload?.mutate(files)}
        className="text-ink-400 hover:text-ink-600 active:bg-ink-300 relative flex h-full w-full items-center justify-center transition-colors"
      >
        <PhotographIcon className="h-5 w-5" aria-hidden="true" />
        {upload?.isLoading && (
          <LoadingIndicator
            className="absolute top-0 left-0 bottom-0 right-0"
            spinnerClassName="!h-6 !w-6 !border-2"
          />
        )}
      </FileUploadButton>
    </Tooltip>
  )
}

function ToolbarButton(props: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const { label, onClick, children } = props

  return (
    <Tooltip text={label} noTap noFade className="w-12 flex-initial">
      <button
        type="button"
        onClick={onClick}
        className="text-ink-400 hover:text-ink-600 active:bg-ink-300 flex h-full w-full items-center justify-center transition-colors"
      >
        {children}
      </button>
    </Tooltip>
  )
}

/** insert a colon, and a space if necessary, to bring up emoji selctor */
const insertEmoji = (editor: Editor | null) => {
  if (!editor) return

  const textBefore = editor.view.state.selection.$from.nodeBefore?.text
  const addSpace = textBefore && !textBefore.endsWith(' ')

  editor
    .chain()
    .focus()
    .createParagraphNear()
    .insertContent(addSpace ? ' :' : ':')
    .run()
}
