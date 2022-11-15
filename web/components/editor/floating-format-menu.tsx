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
import React, { useState } from 'react'
import BoldIcon from 'web/lib/icons/bold-icon'
import ItalicIcon from 'web/lib/icons/italic-icon'
import TypeIcon from 'web/lib/icons/type-icon'

// see https://tiptap.dev/guide/menus

export function FloatingFormatMenu(props: {
  editor: Editor | null
  /** show more formatting options */
  advanced?: boolean
}) {
  const { editor, advanced } = props

  const [url, setUrl] = useState<string | null>(null)

  if (!editor) return null

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
          {advanced && (
            <>
              <IconButton
                icon={TypeIcon}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 1 }).run()
                }
                isActive={editor.isActive('heading', { level: 1 })}
              />
              <IconButton
                icon={TypeIcon}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
                isActive={editor.isActive('heading', { level: 2 })}
                className="!h-4"
              />
              <Divider />
            </>
          )}
          <IconButton
            icon={BoldIcon}
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
          />
          <IconButton
            icon={ItalicIcon}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
          />
          <IconButton
            icon={LinkIcon}
            onClick={() => (editor.isActive('link') ? unsetLink() : setUrl(''))}
            isActive={editor.isActive('link')}
          />
          <IconButton
            icon={EyeOffIcon}
            onClick={() => editor.chain().focus().toggleSpoiler().run()}
            isActive={editor.isActive('spoiler')}
          />
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

const IconButton = (props: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>
  onClick: () => any
  isActive?: boolean
  className?: string
}) => {
  const { icon: Icon, onClick, isActive, className } = props
  return (
    <button onClick={onClick}>
      <Icon className={clsx('h-5', isActive && 'text-indigo-200', className)} />
    </button>
  )
}

const Divider = () => <div className="mx-0.5 w-[1px] bg-gray-400" />
