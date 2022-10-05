import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import {
  useEditor,
  BubbleMenu,
  EditorContent,
  JSONContent,
  Content,
  Editor,
  mergeAttributes,
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
import { mentionSuggestion } from './editor/mention-suggestion'
import { DisplayMention } from './editor/mention'
import { contractMentionSuggestion } from './editor/contract-mention-suggestion'
import { DisplayContractMention } from './editor/contract-mention'
import Iframe from 'common/util/tiptap-iframe'
import TiptapTweet from './editor/tiptap-tweet'
import { EmbedModal } from './editor/embed-modal'
import {
  CheckIcon,
  CodeIcon,
  EyeOffIcon,
  PhotographIcon,
  PresentationChartLineIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { MarketModal } from './editor/market-modal'
import { insertContent } from './editor/utils'
import { Tooltip } from './tooltip'
import BoldIcon from 'web/lib/icons/bold-icon'
import ItalicIcon from 'web/lib/icons/italic-icon'
import LinkIcon from 'web/lib/icons/link-icon'
import { getUrl } from 'common/util/parse'
import { TiptapSpoiler } from 'common/util/tiptap-spoiler'
import { ImageModal } from './editor/image-modal'

const DisplayImage = Image.configure({
  HTMLAttributes: {
    class: 'max-h-60',
  },
})

const DisplayLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    delete HTMLAttributes.class // only use our classes (don't duplicate on paste)
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ]
  },
}).configure({
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

  const editorClass = clsx(
    proseClass,
    !simple && 'min-h-[6em]',
    'outline-none pt-2 px-4',
    'prose-img:select-auto',
    '[&_.ProseMirror-selectednode]:outline-dotted [&_*]:outline-indigo-300' // selected img, emebeds
  )

  const editor = useEditor({
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
        suggestion: mentionSuggestion,
      }),
      DisplayContractMention.configure({
        suggestion: contractMentionSuggestion,
      }),
      Iframe,
      TiptapTweet,
      TiptapSpoiler.configure({
        spoilerOpenClass: 'rounded-sm bg-greyscale-2',
      }),
    ],
    content: defaultValue,
  })

  const upload = useUploadMutation(editor)

  editor?.setOptions({
    editorProps: {
      handlePaste(view, event) {
        const imageFiles = getImages(event.clipboardData)
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
      handleDrop(_view, event, _slice, moved) {
        // if dragged from outside
        if (!moved) {
          event.preventDefault()
          upload.mutate(getImages(event.dataTransfer))
        }
      },
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return { editor, upload }
}

const getImages = (data: DataTransfer | null) =>
  Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image'))

function isValidIframe(text: string) {
  return /^<iframe.*<\/iframe>$/.test(text)
}

function FloatingMenu(props: { editor: Editor | null }) {
  const { editor } = props

  const [url, setUrl] = useState<string | null>(null)

  if (!editor) return null

  // current selection
  const isBold = editor.isActive('bold')
  const isItalic = editor.isActive('italic')
  const isLink = editor.isActive('link')
  const isSpoiler = editor.isActive('spoiler')

  const setLink = () => {
    const href = url && getUrl(url)
    if (href) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
  }

  const unsetLink = () => editor.chain().focus().unsetLink().run()

  return (
    <BubbleMenu
      editor={editor}
      className="flex gap-2 rounded-sm bg-slate-700 p-1 text-white"
    >
      {url === null ? (
        <>
          <button onClick={() => editor.chain().focus().toggleBold().run()}>
            <BoldIcon className={clsx('h-5', isBold && 'text-indigo-200')} />
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()}>
            <ItalicIcon
              className={clsx('h-5', isItalic && 'text-indigo-200')}
            />
          </button>
          <button onClick={() => (isLink ? unsetLink() : setUrl(''))}>
            <LinkIcon className={clsx('h-5', isLink && 'text-indigo-200')} />
          </button>
          <button onClick={() => editor.chain().focus().toggleSpoiler().run()}>
            <EyeOffIcon
              className={clsx('h-5', isSpoiler && 'text-indigo-200')}
            />
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            className="h-5 border-0 bg-inherit text-sm !shadow-none !ring-0"
            placeholder="Type or paste a link"
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={() => (setLink(), setUrl(null))}>
            <CheckIcon className="h-5 w-5" />
          </button>
          <button onClick={() => (unsetLink(), setUrl(null))}>
            <TrashIcon className="h-5 w-5" />
          </button>
        </>
      )}
    </BubbleMenu>
  )
}

export function TextEditor(props: {
  editor: Editor | null
  upload: ReturnType<typeof useUploadMutation>
  children?: React.ReactNode // additional toolbar buttons
}) {
  const { editor, upload, children } = props
  const [imageOpen, setImageOpen] = useState(false)
  const [iframeOpen, setIframeOpen] = useState(false)
  const [marketOpen, setMarketOpen] = useState(false)

  return (
    <>
      {/* hide placeholder when focused */}
      <div className="relative w-full [&:focus-within_p.is-empty]:before:content-none">
        <div className="rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
          <FloatingMenu editor={editor} />
          <EditorContent editor={editor} />
          {/* Toolbar, with buttons for images and embeds */}
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
                <PresentationChartLineIcon
                  className="h-5 w-5"
                  aria-hidden="true"
                />
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
        </div>
      </div>
      {upload.isLoading && <span className="text-xs">Uploading image...</span>}
      {upload.isError && (
        <span className="text-error text-xs">Error uploading image :(</span>
      )}
    </>
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

export function RichContent(props: {
  content: JSONContent | string
  className?: string
  smallImage?: boolean
}) {
  const { className, content, smallImage } = props
  const editor = useEditor({
    editorProps: { attributes: { class: proseClass } },
    extensions: [
      StarterKit,
      smallImage ? DisplayImage : Image,
      DisplayLink.configure({ openOnClick: false }), // stop link opening twice (browser still opens)
      DisplayMention,
      DisplayContractMention.configure({
        // Needed to set a different PluginKey for Prosemirror
        suggestion: contractMentionSuggestion,
      }),
      Iframe,
      TiptapTweet,
      TiptapSpoiler.configure({
        spoilerOpenClass: 'rounded-sm bg-greyscale-2 cursor-text',
        spoilerCloseClass:
          'rounded-sm bg-greyscale-6 text-transparent [&_*]:invisible cursor-pointer select-none',
      }),
    ],
    content,
    editable: false,
  })
  useEffect(
    // Check isDestroyed here so hot reload works, see https://github.com/ueberdosis/tiptap/issues/1451#issuecomment-941988769
    () => void !editor?.isDestroyed && editor?.commands?.setContent(content),
    [editor, content]
  )

  return <EditorContent className={className} editor={editor} />
}

// backwards compatibility: we used to store content as strings
export function Content(props: {
  content: JSONContent | string
  className?: string
  smallImage?: boolean
}) {
  const { className, content } = props
  return typeof content === 'string' ? (
    <Linkify
      className={clsx(
        className,
        'whitespace-pre-line font-light leading-relaxed'
      )}
      text={content}
    />
  ) : (
    <RichContent {...props} />
  )
}
