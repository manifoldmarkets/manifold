import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import { useEditor, EditorContent, JSONContent, Content } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import clsx from 'clsx'
import { useEffect } from 'react'
import { Linkify } from './linkify'
import { uploadImage } from 'web/lib/firebase/storage'
import { useMutation } from 'react-query'

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

  const upload = useMutation((files: File[]) =>
    Promise.all(files.map((file) => uploadImage('default', file)))
  )

  const editor = useEditor({
    editorProps: {
      attributes: {
        class: clsx(proseClass, rowsClass, 'textarea textarea-bordered'),
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter(
          (file) => file.type.startsWith('image')
        )

        if (!files.length) {
          return // if no files pasted, use default paste handler
        }

        event.preventDefault()
        upload.mutate(files, {
          onSuccess: (urls) => {
            let trans = view.state.tr
            urls.forEach((src: any) => {
              const node = view.state.schema.nodes.image.create({ src })
              trans = trans.insert(view.state.selection.to, node)
            })
            view.dispatch(trans)
          },
        })
      },
    },
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      CharacterCount.configure({ limit: max }),
      Image,
    ],
    content: defaultValue,
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return { editor, upload }
}

function RichContent(props: { content: JSONContent }) {
  const { content } = props
  const editor = useEditor({
    editorProps: { attributes: { class: proseClass } },
    extensions: [StarterKit, Image],
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
