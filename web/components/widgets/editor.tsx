import CharacterCount from '@tiptap/extension-character-count'
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
import React, { ReactNode, useCallback, useMemo } from 'react'
import { DisplayContractMention } from '../editor/contract-mention/contract-mention-extension'
import { DisplayMention } from '../editor/user-mention/mention-extension'
import GridComponent from '../editor/tiptap-grid-cards'
import { Linkify } from './linkify'
import { linkClass } from './site-link'
import Iframe from 'common/util/tiptap-iframe'
import { TiptapSpoiler } from 'common/util/tiptap-spoiler'
import { debounce, noop } from 'lodash'
import {
  storageStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { safeLocalStorage } from 'web/lib/util/local'
import { FloatingFormatMenu } from '../editor/floating-format-menu'
import { StickyFormatMenu } from '../editor/sticky-format-menu'
import { DisplayTweet } from '../editor/tweet'
import { Upload, useUploadMutation } from '../editor/upload-extension'
import { generateReact, insertContent } from '../editor/utils'
import { EmojiExtension } from '../editor/emoji/emoji-extension'
import { DisplaySpoiler } from '../editor/spoiler'
import { nodeViewMiddleware } from '../editor/nodeview-middleware'
import { BasicImage, DisplayImage } from '../editor/image'

const DisplayLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    delete HTMLAttributes.class // only use our classes (don't duplicate on paste)
    return ['a', mergeAttributes(HTMLAttributes, { class: linkClass }), 0]
  },
})

export const editorExtensions = (simple = false): Extensions =>
  nodeViewMiddleware([
    StarterKit.configure({
      heading: simple ? false : { levels: [1, 2, 3] },
      horizontalRule: simple ? false : {},
    }),
    simple ? DisplayImage : BasicImage,
    EmojiExtension,
    DisplayLink,
    DisplayMention,
    DisplayContractMention,
    GridComponent,
    Iframe,
    DisplayTweet,
    TiptapSpoiler.configure({ class: 'rounded-sm bg-gray-200' }),
    Upload,
  ])

export const proseClass = (size: 'sm' | 'md' | 'lg') =>
  clsx(
    'prose max-w-none leading-relaxed',
    'prose-a:text-indigo-700 prose-a:no-underline',
    size === 'sm' ? 'prose-sm' : 'text-md',
    size !== 'lg' && 'prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0',
    '[&>p]:prose-li:my-0',
    'text-gray-900 prose-blockquote:text-gray-600',
    'prose-a:font-light prose-blockquote:font-light font-light',
    'break-anywhere'
  )

export function useTextEditor(props: {
  placeholder?: string
  max?: number
  defaultValue?: Content
  size?: 'sm' | 'md' | 'lg'
  key?: string // unique key for autosave. If set, plz call `clearContent(true)` on submit to clear autosave
}) {
  const { placeholder, max, defaultValue, size = 'md', key } = props
  const simple = size === 'sm'

  const [content, saveContent] = usePersistentState<JSONContent | undefined>(
    undefined,
    {
      key: `text ${key}`,
      store: storageStore(safeLocalStorage),
    }
  )

  const save = useCallback(debounce(saveContent, 500), [])

  const editorClass = clsx(
    proseClass(size),
    'outline-none py-[.5em] px-4 h-full',
    'prose-img:select-auto',
    '[&_.ProseMirror-selectednode]:outline-dotted [&_*]:outline-indigo-300' // selected img, embeds
  )

  const editor = useEditor({
    editorProps: {
      attributes: { class: editorClass, spellcheck: simple ? 'true' : 'false' },
    },
    onUpdate: !key ? noop : ({ editor }) => save(editor.getJSON()),
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
  children?: ReactNode // additional toolbar buttons
}) {
  const { editor, children } = props

  return (
    // matches input styling
    <div className="w-full overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm transition-colors focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
      <FloatingFormatMenu editor={editor} advanced={!children} />
      <div
        className={clsx(
          children ? 'min-h-[4.25em]' : 'min-h-[7.5em]', // 1 em padding + line height (1.625) * line count
          'grid max-h-[69vh] overflow-auto'
        )}
      >
        <EditorContent editor={editor} />
      </div>
      <StickyFormatMenu editor={editor}>{children}</StickyFormatMenu>
    </div>
  )
}

function RichContent(props: {
  content: JSONContent
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const { className, content, size = 'md' } = props

  const jsxContent = useMemo(
    () =>
      generateReact(content, [
        StarterKit,
        size === 'sm' ? DisplayImage : BasicImage,
        DisplayLink.configure({ openOnClick: false }), // stop link opening twice (browser still opens)
        DisplayMention,
        DisplayContractMention,
        GridComponent,
        Iframe,
        DisplayTweet,
        DisplaySpoiler,
      ]),
    [content, size]
  )

  return (
    <div
      className={clsx(
        'ProseMirror',
        className,
        proseClass(size),
        String.raw`empty:prose-p:after:content-["\00a0"]` // make empty paragraphs have height
      )}
    >
      {jsxContent}
    </div>
  )
}

// backwards compatibility: we used to store content as strings
export function Content(props: {
  content: JSONContent | string
  /** font/spacing */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { className, size = 'md', content } = props
  return typeof content === 'string' ? (
    <Linkify
      className={clsx('whitespace-pre-line', proseClass(size), className)}
      text={content}
    />
  ) : (
    <RichContent {...(props as any)} />
  )
}
