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
import { useEffect } from 'react'
import { Linkify } from './linkify'
import { uploadImage } from 'web/lib/firebase/storage'
import { useMutation } from 'react-query'
import { exhibitExts } from 'common/util/parse'
import { FileUploadButton } from './file-upload-button'
import { linkClass } from './site-link'

const proseClass = clsx(
  'prose prose-sm prose-p:my-0 prose-li:my-0 prose-blockquote:not-italic max-w-none',
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
    'box-content min-h-[6em] textarea textarea-bordered'
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
      Link.configure({ HTMLAttributes: { class: clsx('no-underline !text-indigo-700', linkClass)}}),
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

        if (!imageFiles.length) {
          return // if no files pasted, use default paste handler
        }

        event.preventDefault()
        upload.mutate(imageFiles)
      },
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return { editor, upload }
}

export function TextEditor(props: {
  editor: Editor | null
  upload: ReturnType<typeof useUploadMutation>
}) {
  const { editor, upload } = props

  return (
    <>
      {/* hide placeholder when focused */}
      <div className="w-full [&:focus-within_p.is-empty]:before:content-none">
        {editor && (
          <FloatingMenu
            editor={editor}
            className="w-full text-sm text-slate-300"
          >
            Type <em>*anything*</em> or even paste or{' '}
            <FileUploadButton
              className="link text-blue-300"
              onFiles={upload.mutate}
            >
              upload an image
            </FileUploadButton>
          </FloatingMenu>
        )}
        <EditorContent editor={editor} />
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
