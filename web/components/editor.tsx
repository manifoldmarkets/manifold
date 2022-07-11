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
import { exhibitExts } from 'common/util/parse'

const proseClass =
  'prose prose-sm prose-p:my-0 prose-li:my-0 prose-blockquote:not-italic max-w-none'

export function useTextEditor(props: {
  placeholder?: string
  max?: number
  defaultValue?: Content
  disabled?: boolean
}) {
  const { placeholder, max, defaultValue = '', disabled } = props

  const editorClass = clsx(
    proseClass,
    'box-content min-h-[6em] textarea textarea-bordered'
  )

  const upload = useMutation((files: File[]) =>
    Promise.all(files.map((file) => uploadImage('default', file)))
  )

  const editor = useEditor({
    editorProps: {
      attributes: { class: editorClass },
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
    <Linkify text={content} />
  ) : (
    <RichContent content={content} />
  )
}
