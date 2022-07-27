import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import {
  useEditor,
  EditorContent,
  FloatingMenu,
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
import { exhibitExts } from 'common/util/parse'
import { FileUploadButton } from './file-upload-button'
import { linkClass } from './site-link'
import Iframe from 'common/util/tiptap-iframe'
import { CodeIcon, PhotographIcon } from '@heroicons/react/solid'
import { Modal } from './layout/modal'
import { Col } from './layout/col'
import { Button } from './button'
import { Row } from './layout/row'
import { Spacer } from './layout/spacer'

const proseClass = clsx(
  'prose prose-p:my-0 prose-li:my-0 prose-blockquote:not-italic max-w-none prose-quoteless leading-relaxed',
  'font-light prose-a:font-light prose-blockquote:font-light'
)

export function useTextEditor(props: {
  placeholder?: string
  max?: number
  defaultValue?: Content
  disabled?: boolean
}) {
  const { placeholder, max, defaultValue = '', disabled } = props

  const editorClass = clsx(
    proseClass,
    'min-h-[6em] resize-none outline-none border-none pt-3 px-4 focus:ring-0'
  )

  const editor = useEditor({
    editorProps: { attributes: { class: editorClass } },
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          'before:content-[attr(data-placeholder)] before:text-slate-500 before:float-left before:h-0',
      }),
      CharacterCount.configure({ limit: max }),
      Image,
      Link.configure({
        HTMLAttributes: {
          class: clsx('no-underline !text-indigo-700', linkClass),
        },
      }),
      Iframe,
    ],
    content: defaultValue,
  })

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
          editor.chain().insertContent(text).run()
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

export function TextEditor(props: {
  editor: Editor | null
  upload: ReturnType<typeof useUploadMutation>
}) {
  const { editor, upload } = props
  const [iframeOpen, setIframeOpen] = useState(false)

  return (
    <>
      {/* hide placeholder when focused */}
      <div className="relative w-full [&:focus-within_p.is-empty]:before:content-none">
        {editor && (
          <FloatingMenu
            editor={editor}
            className={clsx(proseClass, '-ml-2 mr-2 w-full text-slate-300 ')}
          >
            Type <em>*markdown*</em>. Paste or{' '}
            <FileUploadButton
              className="link text-blue-300"
              onFiles={upload.mutate}
            >
              upload
            </FileUploadButton>{' '}
            images!
          </FloatingMenu>
        )}
        <div className="overflow-hidden rounded-lg border border-gray-300 shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
          <EditorContent editor={editor} />
          {/* Spacer element to match the height of the toolbar */}
          <div className="py-2" aria-hidden="true">
            {/* Matches height of button in toolbar (1px border + 36px content height) */}
            <div className="py-px">
              <div className="h-9" />
            </div>
          </div>
        </div>

        {/* Toolbar, with buttons for image and embeds */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between py-2 pl-3 pr-2">
          <div className="flex items-center space-x-5">
            <div className="flex items-center">
              <FileUploadButton
                onFiles={upload.mutate}
                className="-m-2.5 flex h-10 w-10 items-center justify-center rounded-full text-gray-400 hover:text-gray-500"
              >
                <PhotographIcon className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Upload an image</span>
              </FileUploadButton>
            </div>
            <div className="flex items-center">
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
                <span className="sr-only">Embed an iframe</span>
              </button>
            </div>
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
  const [embedCode, setEmbedCode] = useState('')
  const valid = isValidIframe(embedCode)

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
          value={embedCode}
          onChange={(e) => setEmbedCode(e.target.value)}
        />

        {/* Preview the embed if it's valid */}
        {valid ? <RichContent content={embedCode} /> : <Spacer h={2} />}

        <Row className="gap-2">
          <Button
            disabled={!valid}
            onClick={() => {
              if (editor && valid) {
                editor.chain().insertContent(embedCode).run()
                setEmbedCode('')
                setOpen(false)
              }
            }}
          >
            Embed
          </Button>
          <Button
            color="gray"
            onClick={() => {
              setEmbedCode('')
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

function RichContent(props: { content: JSONContent | string }) {
  const { content } = props
  const editor = useEditor({
    editorProps: { attributes: { class: proseClass } },
    extensions: exhibitExts,
    content,
    editable: false,
  })
  useEffect(() => void editor?.commands?.setContent(content), [editor, content])

  return <EditorContent editor={editor} />
}

// backwards compatibility: we used to store content as strings
export function Content(props: { content: JSONContent | string }) {
  const { content } = props
  return typeof content === 'string' ? (
    <div className="whitespace-pre-line font-light leading-relaxed">
      <Linkify text={content} />
    </div>
  ) : (
    <RichContent content={content} />
  )
}
