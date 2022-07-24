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
import { Mention } from '@tiptap/extension-mention'
import clsx from 'clsx'
import { useEffect } from 'react'
import { Linkify } from './linkify'
import { uploadImage } from 'web/lib/firebase/storage'
import { useMutation } from 'react-query'
import { exhibitExts } from 'common/util/parse'
import { FileUploadButton } from './file-upload-button'
import { linkClass } from './site-link'
import { useUsers } from 'web/hooks/use-users'
import { mentionSuggestion } from './editor/mention-suggestion'
import { DisplayMention } from './editor/mention'

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

  const users = useUsers()

  const editorClass = clsx(
    proseClass,
    'box-content min-h-[6em] textarea textarea-bordered text-base'
  )

  const editor = useEditor(
    {
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
        DisplayMention.configure({
          suggestion: mentionSuggestion(users),
        }),
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

function RichContent(props: { content: JSONContent }) {
  const { content } = props
  const editor = useEditor({
    editorProps: { attributes: { class: proseClass } },
    extensions: [
      // replace tiptap's Mention with ours, to add style and link
      ...exhibitExts.filter((ex) => ex.name !== Mention.name),
      DisplayMention,
    ],
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
