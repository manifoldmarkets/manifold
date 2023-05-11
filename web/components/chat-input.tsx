import React, { useState } from 'react'
import clsx from 'clsx'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { MAX_COMMENT_LENGTH } from 'web/lib/firebase/comments'
import { safeLocalStorage } from 'web/lib/util/local'
import { useUser } from 'web/hooks/use-user'
import { call } from 'web/lib/firebase/api'
import { getApiUrl } from 'common/api'
import { Col } from 'web/components/layout/col'
import { Extension } from '@tiptap/core'
import { useEvent } from 'web/hooks/use-event'
import { PaperAirplaneIcon } from '@heroicons/react/solid'

const interceptNewline = (callback: () => void) => {
  return Extension.create({
    name: 'interceptNewline',

    addKeyboardShortcuts() {
      return {
        Enter: () => {
          callback()
          return true
        },
      }
    },
  })
}
interface ChatInputProps {
  className?: string
}
const key = 'live-chat'
const ChatInput: React.FC<ChatInputProps> = ({ className }) => {
  const submitComment = useEvent(async () => {
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    editor.commands.focus('end')
    // if last item is text, try to linkify it by adding and deleting a space
    if (editor.state.selection.empty) {
      editor.commands.insertContent(' ')
      const endPos = editor.state.selection.from
      editor.commands.deleteRange({ from: endPos - 1, to: endPos })
    }
    await call(getApiUrl('createchatmessage'), 'POST', {
      content: editor.getJSON(),
      channelId: '0',
    })
    setIsSubmitting(false)
    editor.commands.clearContent(true)
    // force clear save, because it can fail if editor unrenders
    safeLocalStorage?.removeItem(`text ${key}`)
  })

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder: 'Say something...',
    extensions: [interceptNewline(submitComment)],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const user = useUser()

  if (user?.isBannedFromPosting) return <></>

  return (
    <Col
      className={clsx(
        'sticky bottom-14 w-full items-center justify-center py-2 shadow-md lg:bottom-0',
        className
      )}
    >
      <TextEditor
        editor={editor}
        simple
        hideToolbar
        className={'relative h-16'}
      >
        {user && (
          <button
            className=" text-ink-400 hover:text-ink-600 active:bg-ink-300 disabled:text-ink-300 absolute bottom-2 px-4 transition-colors sm:hidden"
            disabled={!editor || editor.isEmpty}
            onClick={submitComment}
          >
            {!isSubmitting ? (
              <PaperAirplaneIcon className="m-0 h-[25px] w-[22px] rotate-90 p-0" />
            ) : (
              <LoadingIndicator />
            )}
          </button>
        )}
      </TextEditor>
    </Col>
  )
}

export default ChatInput
