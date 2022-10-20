import CharacterCount from '@tiptap/extension-character-count'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Content,
  Editor,
  EditorContent,
  Extensions,
  JSONContent,
  mergeAttributes,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import clsx from 'clsx'
import { useCallback, useEffect } from 'react'
import { DisplayContractMention } from '../editor/contract-mention'
import { DisplayMention } from '../editor/mention'
import GridComponent from '../editor/tiptap-grid-cards'
import StaticReactEmbedComponent from '../editor/tiptap-static-react-embed'
import { Linkify } from './linkify'
import { linkClass } from './site-link'
import Iframe from 'common/util/tiptap-iframe'
import { TiptapSpoiler } from 'common/util/tiptap-spoiler'
import { debounce } from 'lodash'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { FloatingFormatMenu } from '../editor/floating-format-menu'
import { StickyFormatMenu } from '../editor/sticky-format-menu'
import TiptapTweet from '../editor/tiptap-tweet'
import { Upload, useUploadMutation } from '../editor/upload-extension'
import { insertContent } from '../editor/utils'

const DisplayImage = Image.configure({
  HTMLAttributes: {
    class: 'max-h-96',
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

export const editorExtensions = (simple = false): Extensions => [
  StarterKit.configure({
    heading: simple ? false : { levels: [1, 2, 3] },
    horizontalRule: simple ? false : {},
  }),
  simple ? DisplayImage : Image,
  DisplayLink,
  DisplayMention,
  DisplayContractMention,
  GridComponent,
  StaticReactEmbedComponent,
  Iframe,
  TiptapTweet,
  TiptapSpoiler.configure({
    spoilerOpenClass: 'rounded-sm bg-greyscale-2',
  }),
  Upload,
]

const proseClass = clsx(
  'prose prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-blockquote:not-italic max-w-none prose-quoteless leading-relaxed',
  'font-light prose-a:font-light prose-blockquote:font-light prose-sm'
)

export function useTextEditor(props: {
  placeholder?: string
  max?: number
  defaultValue?: Content
  simple?: boolean
  key?: string // unique key for autosave. If set, plz call `clearContent(true)` on submit to clear autosave
}) {
  const { placeholder, max, defaultValue, simple, key } = props

  const [content, saveContent] = usePersistentState<JSONContent | undefined>(
    undefined,
    {
      key: `text ${key}`,
      store: storageStore(safeLocalStorage()),
    }
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const save = useCallback(debounce(saveContent, 500), [])

  const editorClass = clsx(
    proseClass,
    simple ? 'min-h-[4.25em]' : 'min-h-[7.5em]', // 1 em padding + 13/8 em * line count
    'max-h-[69vh] overflow-auto',
    'outline-none py-[.5em] px-4',
    'prose-img:select-auto',
    '[&_.ProseMirror-selectednode]:outline-dotted [&_*]:outline-indigo-300' // selected img, embeds
  )

  const editor = useEditor({
    editorProps: {
      attributes: { class: editorClass, spellcheck: simple ? 'true' : 'false' },
    },
    onUpdate: key ? ({ editor }) => save(editor.getJSON()) : undefined,
    extensions: [
      ...editorExtensions(simple),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          'before:content-[attr(data-placeholder)] before:text-slate-500 before:float-left before:h-0 cursor-text',
      }),
      CharacterCount.configure({ limit: max }),
    ],
    content: defaultValue ?? (key && content ? content : ''),
  })

  const upload = useUploadMutation(editor)
  if (!editor) return null
  editor.storage.upload.mutation = upload

  editor.setOptions({
    editorProps: {
      handlePaste(view, event) {
        const imageFiles = getImages(event.clipboardData)
        if (imageFiles.length) {
          event.preventDefault()
          upload.mutate(imageFiles)
          return true // Prevent image in text/html from getting pasted again
        }

        // If the pasted content is iframe code, directly inject it
        const text = event.clipboardData?.getData('text/plain').trim() ?? ''
        if (isValidIframe(text)) {
          insertContent(editor, text)
          return true // Prevent the code from getting pasted as text
        }

        // Otherwise, use default paste handler
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

  return editor
}

const getImages = (data: DataTransfer | null) =>
  Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image'))

function isValidIframe(text: string) {
  return /^<iframe.*<\/iframe>$/.test(text)
}

export function TextEditor(props: {
  editor: Editor | null
  children?: React.ReactNode // additional toolbar buttons
}) {
  const { editor, children } = props
  const upload = editor?.storage.upload.mutation ?? {}

  return (
    <>
      {/* matches input styling */}
      <div className="w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm transition-colors focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
        <FloatingFormatMenu editor={editor} />
        <EditorContent editor={editor} />
        <StickyFormatMenu editor={editor}>{children}</StickyFormatMenu>
      </div>
      {upload.isLoading && <span className="text-xs">Uploading image...</span>}
      {upload.isError && (
        <span className="text-error text-xs">Error uploading image :(</span>
      )}
    </>
  )
}

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
      DisplayContractMention,
      GridComponent,
      StaticReactEmbedComponent,
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
