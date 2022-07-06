import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import { useEditor, EditorContent, JSONContent, Content } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import clsx from 'clsx'
import { useEffect } from 'react'
import { Linkify } from './linkify'

const LINE_HEIGHT = 2

const proseClass = 'prose prose-sm prose-p:my-0 prose-li:my-0 max-w-none'

export function useTextEditor(props: {
  rows?: number
  placeholder?: string
  max?: number
  defaultValue?: Content
  disabled?: boolean
}) {
  const { rows, placeholder, max, defaultValue = '', disabled } = props

  const rowsClass = rows && `box-content min-h-[${LINE_HEIGHT * rows}em]`

  const editor = useEditor({
    editorProps: {
      attributes: {
        class: clsx(proseClass, rowsClass, 'textarea textarea-bordered'),
      },
    },
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: max }),
    ],
    content: defaultValue,
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return editor
}

function RichContent(props: { content: JSONContent }) {
  const { content } = props
  const editor = useEditor({
    editorProps: { attributes: { class: proseClass } },
    extensions: [StarterKit],
    content,
    editable: false,
  })
  return <EditorContent editor={editor} />
}

// backwards compatibility: we used to store content as strings
export function Content(props: { content: JSONContent | string }) {
  const { content } = props
  return typeof content === 'string' ? (
    <Linkify text={content} />
  ) : (
    <RichContent content={content} />
  )
}
