import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import {
  useEditor,
  EditorContent,
  JSONContent,
  Content,
  Editor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Linkify } from './linkify'
import { uploadImage } from 'web/lib/firebase/storage'
import { useMutation } from 'react-query'
import { FileUploadButton } from './file-upload-button'
import { linkClass } from './site-link'
import { useUsers } from 'web/hooks/use-users'
import { mentionSuggestion } from './editor/mention-suggestion'
import { DisplayMention } from './editor/mention'
import Iframe from 'common/util/tiptap-iframe'
import {
  CodeIcon,
  PhotographIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/solid'
import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Button } from './button'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'
import { MarketModal } from './editor/market-modal'
import { insertContent } from './editor/utils'

const DisplayImage = Image.configure({
  HTMLAttributes: {
    class: 'max-h-60',
  },
})

const DisplayLink = Link.configure({
  HTMLAttributes: {
    class: clsx('no-underline !text-indigo-700', linkClass),
  },
})

const proseClass = clsx(
  'prose prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:not-italic max-w-none prose-quoteless leading-relaxed',
  'font-light prose-a:font-light prose-blockquote:font-light'
)

export function useTextEditor(props: {
  placeholder?: string
  max?: number
  defaultValue?: Content
  disabled?: boolean
  simple?: boolean
}) {
  const { placeholder, max, defaultValue = '', disabled, simple } = props

  const users = useUsers()

  const editorClass = clsx(
    proseClass,
    !simple && 'min-h-[6em]',
    'outline-none pt-2 px-4'
  )

  const editor = useEditor(
    {
      editorProps: { attributes: { class: editorClass } },
      extensions: [
        StarterKit.configure({
          heading: simple ? false : { levels: [1, 2, 3] },
          horizontalRule: simple ? false : {},
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass:
            'before:content-[attr(data-placeholder)] before:text-slate-500 before:float-left before:h-0 cursor-text',
        }),
        CharacterCount.configure({ limit: max }),
        simple ? DisplayImage : Image,
        DisplayLink,
        DisplayMention.configure({
          suggestion: mentionSuggestion(users),
        }),
        Iframe,
      ],
      content: defaultValue,
    },
    [!users.length] // passed as useEffect dependency. (re-render editor when users load, to update mention menu)
  )

  const upload = useUploadMutation(editor)

  editor?.setOptions({
    editorProps: {
      handlePaste(view, event) {
        const imageFiles = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith('image')
        )

        if (imageFiles.length) {
          event.preventDefault()
          upload.mutate(imageFiles)
        }

        // If the pasted content is iframe code, directly inject it
        const text = event.clipboardData?.getData('text/plain').trim() ?? ''
        if (isValidIframe(text)) {
          insertContent(editor, text)
          return true // Prevent the code from getting pasted as text
        }

        return // Otherwise, use default paste handler
      },
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return { editor, upload }
}

function isValidIframe(text: string) {
  return /^<iframe.*<\/iframe>$/.test(text)
}

function isValidUrl(text: string) {
  // Conjured by Codex, not sure if it's actually good
  return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(
    text
  )
}

export function TextEditor(props: {
  editor: Editor | null
  upload: ReturnType<typeof useUploadMutation>
  children?: React.ReactNode // additional toolbar buttons
}) {
  const { editor, upload, children } = props
  const [iframeOpen, setIframeOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)

  return (
    <>
      {/* hide placeholder when focused */}
      <div className="relative w-full [&:focus-within_p.is-empty]:before:content-none">
        <div className="rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
          <EditorContent editor={editor} />
          {/* Toolbar, with buttons for images and embeds */}
          <div className="flex h-9 items-center gap-5 pl-4 pr-1">
            <div className="tooltip flex items-center" data-tip="Add image">
              <FileUploadButton
                onFiles={upload.mutate}
                className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500"
              >
                <PhotographIcon className="h-5 w-5" aria-hidden="true" />
              </FileUploadButton>
            </div>
            <div className="tooltip flex items-center" data-tip="Add embed">
              <button
                type="button"
                onClick={() => setIframeOpen(true)}
                className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500"
              >
                <IframeModal
                  editor={editor}
                  open={iframeOpen}
                  setOpen={setIframeOpen}
                />
                <CodeIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="tooltip flex items-center" data-tip="Add market">
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
                <PresentationChartLineIcon
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </button>
            </div>
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
        </div>
      </div>
      {upload.isLoading && <span className="text-xs">Uploading image...</span>}
      {upload.isError && (
        <span className="text-error text-xs">Error uploading image :(</span>
      )}
    </>
  )
}

function IframeModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, open, setOpen } = props
  const [input, setInput] = useState('')
  const valid = isValidIframe(input) || isValidUrl(input)
  const embedCode = isValidIframe(input) ? input : `<iframe src="${input}" />`

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="gap-2 rounded bg-white p-6">
        <label
          htmlFor="embed"
          className="block text-sm font-medium text-gray-700"
        >
          Embed a market, Youtube video, etc.
        </label>
        <input
          type="text"
          name="embed"
          id="embed"
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          placeholder='e.g. <iframe src="..."></iframe>'
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />

        {/* Preview the embed if it's valid */}
        {valid ? <RichContent content={embedCode} /> : <Spacer h={2} />}

        <Row className="gap-2">
          <Button
            disabled={!valid}
            onClick={() => {
              if (editor && valid) {
                insertContent(editor, embedCode)
                setInput('')
                setOpen(false)
              }
            }}
          >
            Embed
          </Button>
          <Button
            color="gray"
            onClick={() => {
              setInput('')
              setOpen(false)
            }}
          >
            Cancel
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

const useUploadMutation = (editor: Editor | null) =>
  useMutation(
    (files: File[]) =>
      // TODO: Images should be uploaded under a particular username
      Promise.all(files.map((file) => uploadImage('default', file))),
    {
      onSuccess(urls) {
        if (!editor) return
        let trans = editor.view.state.tr
        urls.forEach((src: any) => {
          const node = editor.view.state.schema.nodes.image.create({ src })
          trans = trans.insert(editor.view.state.selection.to, node)
        })
        editor.view.dispatch(trans)
      },
    }
  )

function RichContent(props: {
  content: JSONContent | string
  smallImage?: boolean
}) {
  const { content, smallImage } = props
  const editor = useEditor({
    editorProps: { attributes: { class: proseClass } },
    extensions: [
      StarterKit,
      smallImage ? DisplayImage : Image,
      DisplayLink,
      DisplayMention,
      Iframe,
    ],
    content,
    editable: false,
  })
  useEffect(() => void editor?.commands?.setContent(content), [editor, content])

  return <EditorContent editor={editor} />
}

// backwards compatibility: we used to store content as strings
export function Content(props: {
  content: JSONContent | string
  smallImage?: boolean
}) {
  const { content } = props
  return typeof content === 'string' ? (
    <div className="whitespace-pre-line font-light leading-relaxed">
      <Linkify text={content} />
    </div>
  ) : (
    <RichContent {...props} />
  )
}
