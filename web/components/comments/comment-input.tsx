import { PaperAirplaneIcon } from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { Avatar } from '../widgets/avatar'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { ReplyToUserInfo } from '../feed/feed-comments'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { safeLocalStorage } from 'web/lib/util/local'

export function CommentInput(props: {
  replyToUserInfo?: ReplyToUserInfo
  // Reply to another comment
  parentCommentId?: string
  onSubmitComment?: (editor: Editor) => void
  // unique id for autosave
  pageId: string
  className?: string
  blocked?: boolean
  placeholder?: string
}) {
  const {
    parentCommentId,
    replyToUserInfo,
    onSubmitComment,
    pageId,
    className,
    blocked,
    placeholder = 'Write a comment...',
  } = props
  const user = useUser()

  const key = `comment ${pageId} ${parentCommentId ?? ''}`

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder,
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitComment() {
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    editor.commands.focus('end')
    // if last item is text, try to linkify it by adding and deleting a space
    if (editor.state.selection.empty) {
      editor.commands.insertContent(' ')
      const endPos = editor.state.selection.from
      editor.commands.deleteRange({ from: endPos - 1, to: endPos })
    }

    onSubmitComment?.(editor)
    setIsSubmitting(false)
    editor.commands.clearContent(true)
    // force clear save, because it can fail if editor unrenders
    safeLocalStorage?.removeItem(`text ${key}`)
  }

  if (user?.isBannedFromPosting) return <></>

  return blocked ? (
    <div className={'text-ink-500 mb-3 text-sm'}>
      You blocked the creator or they blocked you, so you can't comment.
    </div>
  ) : (
    <Row className={clsx(className, 'mb-2 w-full gap-1 sm:gap-2')}>
      <Avatar avatarUrl={user?.avatarUrl} username={user?.username} size="sm" />
      <CommentInputTextArea
        editor={editor}
        replyTo={replyToUserInfo}
        user={user}
        submit={submitComment}
        isSubmitting={isSubmitting}
      />
    </Row>
  )
}

export function CommentInputTextArea(props: {
  user: User | undefined | null
  replyTo?: { id: string; username: string }
  editor: Editor | null
  submit: () => void
  isSubmitting: boolean
  submitOnEnter?: boolean
}) {
  const { user, submitOnEnter, editor, submit, isSubmitting, replyTo } = props
  useEffect(() => {
    editor?.setEditable(!isSubmitting)
  }, [isSubmitting, editor])

  useEffect(() => {
    if (!editor) return

    // Submit on ctrl+enter or mod+enter key
    editor.setOptions({
      editorProps: {
        handleKeyDown: (view, event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            (!submitOnEnter ? event.ctrlKey || event.metaKey : true) &&
            // mention list is closed
            !(view.state as any).mention$.active
          ) {
            submit()
            event.preventDefault()
            return true
          }
          return false
        },
      },
    })
  }, [editor])

  useEffect(() => {
    if (!editor) return
    // insert at mention and focus
    if (replyTo && editor.isEmpty) {
      editor
        .chain()
        .setContent({
          type: 'mention',
          attrs: { label: replyTo.username, id: replyTo.id },
        })
        .insertContent(' ')
        .focus(undefined, { scrollIntoView: false })
        .run()
    }
  }, [replyTo, editor])

  return (
    <TextEditor editor={editor} simple>
      {user && !isSubmitting && (
        <button
          className="text-ink-400 hover:text-ink-600 active:bg-ink-300 disabled:text-ink-300 px-4 transition-colors"
          disabled={!editor || editor.isEmpty}
          onClick={submit}
        >
          <PaperAirplaneIcon className="m-0 h-[25px] w-[22px] rotate-90 p-0" />
        </button>
      )}

      {isSubmitting && <LoadingIndicator spinnerClassName="border-ink-500" />}
    </TextEditor>
  )
}
