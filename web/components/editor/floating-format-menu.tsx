import {
  LinkIcon,
  EyeOffIcon,
  CheckIcon,
  TrashIcon,
} from '@heroicons/react/solid'
import { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react'
import clsx from 'clsx'
import { getUrl } from 'common/util/parse'
import { useState } from 'react'
import BoldIcon from 'web/lib/icons/bold-icon'
import ItalicIcon from 'web/lib/icons/italic-icon'

export function FloatingFormatMenu(props: { editor: Editor | null }) {
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
