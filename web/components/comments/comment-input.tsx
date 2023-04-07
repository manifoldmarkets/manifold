import { PaperAirplaneIcon, XCircleIcon } from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { AnyContractType, Contract } from 'common/contract'
import { User } from 'common/user'
import React, { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { MAX_COMMENT_LENGTH } from 'web/lib/firebase/comments'
import Curve from 'web/public/custom-components/curve'
import { getAnswerColor } from '../answers/answers-panel'
import { Avatar } from '../widgets/avatar'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { CommentsAnswer } from '../feed/feed-answer-comment-group'
import { ContractCommentInput } from '../feed/feed-comments'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { safeLocalStorage } from 'web/lib/util/local'

export function CommentInput(props: {
  replyTo?: { id: string; username: string }
  // Reply to a free response answer
  parentAnswerOutcome?: string
  // Reply to another comment
  parentCommentId?: string
  onSubmitComment?: (editor: Editor) => void
  // unique id for autosave
  pageId: string
  className?: string
  blocked?: boolean
}) {
  const {
    parentAnswerOutcome,
    parentCommentId,
    replyTo,
    onSubmitComment,
    pageId,
    blocked,
  } = props
  const user = useUser()

  const key = `comment ${pageId} ${
    parentCommentId ?? parentAnswerOutcome ?? ''
  }`

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder:
      !!parentCommentId || !!parentAnswerOutcome
        ? 'Write a reply...'
        : 'Write a comment...',
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
    <Row className={clsx(props.className, 'mb-2 gap-1 sm:gap-2')}>
      <Avatar
        avatarUrl={user?.avatarUrl}
        username={user?.username}
        size="sm"
        className="mt-2"
      />
      <div className="min-w-0 flex-1 pl-0.5 text-sm">
        <CommentInputTextArea
          editor={editor}
          replyTo={replyTo}
          user={user}
          submit={submitComment}
          isSubmitting={isSubmitting}
        />
      </div>
    </Row>
  )
}
export function AnswerCommentInput(props: {
  contract: Contract<AnyContractType>
  answerResponse: Answer
  onCancelAnswerResponse?: () => void
  answersArray: string[]
}) {
  const { contract, answerResponse, onCancelAnswerResponse, answersArray } =
    props
  const replyTo = {
    id: answerResponse.id,
    username: answerResponse.username,
  }
  const color = getAnswerColor(answerResponse, answersArray)
  return (
    <>
      <Col>
        <Row className="relative">
          <div className="absolute -bottom-1 left-1.5 z-20">
            <Curve size={32} strokeWidth={1} color="#D8D8EB" />
          </div>
          <div className="ml-[38px]">
            <CommentsAnswer
              answer={answerResponse}
              contract={contract}
              color={color}
            />
          </div>
        </Row>
        <div className="relative w-full pt-1">
          <ContractCommentInput
            contract={contract}
            replyToAnswerId={answerResponse.id}
            replyTo={replyTo}
            onSubmitComment={onCancelAnswerResponse}
          />
          <button onClick={onCancelAnswerResponse}>
            <div className="bg-canvas-0 absolute -top-1 -right-2 h-4 w-4 rounded-full" />
            <XCircleIcon className="text-ink-500 hover:text-ink-600 absolute -top-1 -right-2 h-5 w-5" />
          </button>
        </div>
      </Col>
    </>
  )
}

export function CommentInputTextArea(props: {
  user: User | undefined | null
  replyTo?: { id: string; username: string }
  editor: Editor | null
  submit: () => void
  isSubmitting: boolean
}) {
  const { user, editor, submit, isSubmitting, replyTo } = props
  useEffect(() => {
    editor?.setEditable(!isSubmitting)
  }, [isSubmitting, editor])

  useEffect(() => {
    if (!editor) {
      return
    }
    // Submit on ctrl+enter or mod+enter key
    editor.setOptions({
      editorProps: {
        handleKeyDown: (view, event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            (event.ctrlKey || event.metaKey) &&
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
  }, [editor])

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
