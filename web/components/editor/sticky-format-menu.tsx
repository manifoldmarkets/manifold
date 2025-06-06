import { EmojiHappyIcon } from '@heroicons/react/outline'
import {
  CodeIcon,
  PhotographIcon,
  PlusCircleIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { FileUploadButton } from '../buttons/file-upload-button'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { EmbedModal } from './embed-modal'
import { MarketModal } from './market-modal'
import type { UploadMutation } from './upload-extension'
import { PiGifFill } from 'react-icons/pi'
import { GIFModal } from './gif-modal'
import { Row } from 'web/components/layout/row'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { MenuItem } from '@headlessui/react'

/* Toolbar, with buttons for images and embeds */
export function StickyFormatMenu(props: {
  editor: Editor | null
  children?: React.ReactNode
}) {
  const { editor, children } = props
  const upload = editor?.storage.upload.mutation

  const [iframeOpen, setIframeOpen] = useState(false)
  const [GIFOpen, setGIFOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)

  return (
    <Row className="text-ink-600 ml-2 h-8 items-center">
      <DropdownMenu
        withinOverflowContainer
        anchor={{ to: 'bottom start', gap: 8, padding: 4 }}
        buttonContent={
          <PlusCircleIcon
            className=" hover:text-ink-700 text-ink-500 h-5 w-5"
            aria-hidden
          />
        }
        items={[
          {
            name: 'upload',
            nonButtonContent: (
              <MenuItem>
                <UploadButton upload={upload} />
              </MenuItem>
            ),
          },
          {
            name: 'Add GIF',
            onClick: () => setGIFOpen(true),
            icon: <PiGifFill className="h-5 w-5" aria-hidden />,
          },
          {
            name: 'Add embed',
            onClick: () => setIframeOpen(true),
            icon: <CodeIcon className="h-5 w-5" aria-hidden="true" />,
          },
          {
            name: 'Add question',
            onClick: () => setMarketOpen(true),
            icon: (
              <PresentationChartLineIcon
                className="h-5 w-5"
                aria-hidden="true"
              />
            ),
          },
          {
            name: 'Add emoji',
            onClick: () => insertEmoji(editor),
            icon: <EmojiHappyIcon className="h-5 w-5" />,
          },
        ]}
      />

      <EmbedModal editor={editor} open={iframeOpen} setOpen={setIframeOpen} />
      <MarketModal editor={editor} open={marketOpen} setOpen={setMarketOpen} />
      <GIFModal editor={editor} open={GIFOpen} setOpen={setGIFOpen} />

      <div className="grow" />
      {children}
    </Row>
  )
}

function UploadButton(props: { upload: UploadMutation }) {
  const { upload } = props

  return (
    <FileUploadButton
      onFiles={(files) => upload?.mutate(files)}
      className="data-[focus]:bg-ink-100 data-[focus]:text-ink-900 text-ink-700 relative flex items-center px-4 py-2 text-sm"
    >
      <Row className={'items-center justify-start gap-2'}>
        <PhotographIcon className="h-5 w-5" aria-hidden="true" />
        {upload?.isLoading ? (
          <LoadingIndicator
            className="absolute bottom-0 left-0 right-0 top-0"
            spinnerClassName="!h-6 !w-6 !border-2"
          />
        ) : (
          <span>Upload image</span>
        )}
      </Row>
    </FileUploadButton>
  )
}

/** insert a colon, and a space if necessary, to bring up emoji selector */
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
