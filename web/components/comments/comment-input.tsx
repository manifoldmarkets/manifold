import { PaperAirplaneIcon, ShieldCheckIcon } from '@heroicons/react/solid'
import { Editor } from '@tiptap/react'
import { useEvent } from 'client-common/hooks/use-event'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { Bet } from 'common/bet'
import { ContractComment, MAX_COMMENT_LENGTH } from 'common/comment'
import { Contract } from 'common/contract'
import { STARTING_BALANCE } from 'common/economy'
import {
  canCommentOnMarket,
  hasAccountTrustSignal,
  NEW_USER_COMMENT_GATE_MS,
  User,
} from 'common/user'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BiRepost } from 'react-icons/bi'
import { Button } from 'web/components/buttons/button'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useAnswer } from 'web/hooks/use-answers'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'
import { useIsClient } from 'web/hooks/use-is-client'
import { api, APIError } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { safeLocalStorage } from 'web/lib/util/local'
import { CommentOnAnswer } from '../feed/comment-on-answer'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { TextEditor, useTextEditor } from '../widgets/editor'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ReplyToUserInfo } from './comment'
import { ReplyToBetRow } from './comment-header'

export function CommentInput(props: {
  replyToUserInfo?: ReplyToUserInfo
  // Reply to another comment
  parentCommentId?: string
  onSubmitComment: (editor: Editor, type: CommentType) => Promise<void>
  // unique id for autosave
  pageId: string
  className?: string
  blocked?: boolean
  placeholder?: string
  commentTypes: CommentType[]
  autoFocus: boolean
  onClearInput?: () => void
  priorityUserIds?: string[] // user IDs to prioritize in mention suggestions (e.g., contract creator first, then commenters)
  // When true (market comments), also allows the age-based market-comment
  // fallback. Post comments use the narrower account-trust gate.
  allowPurchasedMana?: boolean
}) {
  const {
    parentCommentId,
    replyToUserInfo,
    onSubmitComment,
    pageId,
    className,
    blocked,
    autoFocus,
    placeholder = 'What is your prediction?',
    commentTypes,
    onClearInput,
    priorityUserIds,
    allowPurchasedMana,
  } = props
  const user = useUser()

  const key = `comment ${pageId} ${parentCommentId ?? ''}`
  const [isSubmitting, setIsSubmitting] = useState(false)

  const editor = useTextEditor({
    key,
    size: 'sm',
    max: MAX_COMMENT_LENGTH,
    placeholder,
    className: isSubmitting ? '!text-ink-400' : '',
    priorityUserIds,
  })

  const submitComment = useEvent(async (type: CommentType) => {
    if (!editor || editor.isEmpty || isSubmitting) return
    setIsSubmitting(true)
    if (!user) {
      track('sign in to comment')
      await firebaseLogin()
      setIsSubmitting(false)
      return
    }
    editor.commands.focus('end')
    // if last item is text, try to linkify it by adding and deleting a space
    if (editor.state.selection.empty) {
      editor.commands.insertContent(' ')
      const endPos = editor.state.selection.from
      editor.commands.deleteRange({ from: endPos - 1, to: endPos })
    }

    try {
      await onSubmitComment?.(editor, type)
      if (!editor.isDestroyed) editor.commands.clearContent(true)
      // force clear save, because it can fail if editor unrenders
      safeLocalStorage?.removeItem(`text ${key}`)
      onClearInput?.()
    } catch (e) {
      console.error(e)
      if (e instanceof APIError) {
        toast.error(e.message)
      } else toast.error('Error submitting. Try again?')
    } finally {
      setIsSubmitting(false)
    }
  })

  if (user?.isBannedFromPosting) return <></>

  const canComment = user
    ? allowPurchasedMana
      ? canCommentOnMarket(user)
      : hasAccountTrustSignal(user)
    : true
  const showVerifyPrompt =
    user &&
    !canComment &&
    (allowPurchasedMana || user.bonusEligibility !== 'ineligible')
  if (showVerifyPrompt)
    return (
      <VerifyToCommentPrompt
        user={user}
        allowPurchasedMana={allowPurchasedMana}
        className={className}
      />
    )

  return blocked ? (
    <div className={'text-ink-500 mb-3 text-sm'}>
      You blocked the creator or they blocked you, so you can't comment.
    </div>
  ) : (
    <Row className={clsx(className, 'mb-2 w-full gap-1 sm:gap-2')}>
      <div className="isolate shrink-0">
        <Avatar
          avatarUrl={user?.avatarUrl}
          username={user?.username}
          size="sm"
          entitlements={user?.entitlements}
          displayContext="market_comments"
        />
      </div>
      <CommentInputTextArea
        editor={editor}
        autoFocus={autoFocus}
        replyTo={replyToUserInfo}
        user={user}
        submit={submitComment}
        isSubmitting={isSubmitting}
        commentTypes={commentTypes}
      />
    </Row>
  )
}
const emojiMenuActive = (view: { state: any }) => {
  const regex = /^emoji\$.*$/ // emoji$ can have random numbers following it....❤️ tiptap
  let active = false

  for (const key in view.state) {
    if (regex.test(key)) {
      active = (view.state as any)[key].active
      if (active) break
    }
  }

  return active
}

export type CommentType = 'comment' | 'repost' | 'top-level-post'
export function CommentInputTextArea(props: {
  user: User | undefined | null
  replyTo?: { id: string; username: string }
  editor: Editor | null
  submit?: (type: CommentType) => void
  isSubmitting: boolean
  submitOnEnter?: boolean
  autoFocus: boolean
  hideToolbar?: boolean
  commentTypes?: CommentType[]
}) {
  const {
    user,
    hideToolbar,
    submitOnEnter,
    editor,
    submit,
    isSubmitting,
    autoFocus,
    replyTo,
    commentTypes = ['comment'],
  } = props
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
            !(view.state as any).mention$.active &&
            // emoji list is closed
            !emojiMenuActive(view)
          ) {
            submit?.(commentTypes[0])
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

  useEffect(() => {
    if (editor && autoFocus) editor.commands.focus('end')
  }, [editor, autoFocus])

  return (
    <TextEditor editor={editor} simple hideToolbar={hideToolbar}>
      <Row className={''}>
        {user && !isSubmitting && submit && commentTypes.includes('repost') && (
          <Tooltip
            text={'Post question & comment to your followers'}
            className={'mt-2'}
          >
            <button
              disabled={!editor || editor.isEmpty}
              className="text-ink-500 hover:text-ink-700 active:bg-ink-300 disabled:text-ink-300 px-2 transition-colors"
              onClick={() => submit('repost')}
            >
              <BiRepost className="h-7 w-7" />
            </button>
          </Tooltip>
        )}
        {!isSubmitting &&
          submit &&
          (commentTypes[0] === 'comment' ||
            commentTypes[0] === 'top-level-post') && (
            <button
              className="text-ink-500 hover:text-ink-700 active:bg-ink-300 disabled:text-ink-300 px-4 transition-colors"
              disabled={!editor || editor.isEmpty}
              onClick={() => submit(commentTypes[0])}
            >
              <PaperAirplaneIcon className="m-0 h-[25px] w-[22px] rotate-90 p-0" />
            </button>
          )}

        {submit && isSubmitting && (
          <LoadingIndicator
            size={'md'}
            className={'px-4'}
            spinnerColor="border-ink-500"
          />
        )}
      </Row>
    </TextEditor>
  )
}

function VerifyToCommentPrompt(props: {
  user: User
  allowPurchasedMana?: boolean
  className?: string
}) {
  const { user, allowPurchasedMana, className } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      track('comment verification prompt: clicked')
      const response = await api('create-idenfy-session', {})
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError(
        e instanceof APIError && e.code === 503
          ? e.message
          : 'Failed to start verification. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  // Denied (failed KYC) — verification path is closed, surface that explicitly
  // and point to support so the user has a path forward.
  if (user.bonusEligibility === 'ineligible') {
    return (
      <Col
        className={clsx(
          className,
          'border-scarlet-300 bg-scarlet-50 mb-2 w-full rounded-lg border p-3'
        )}
      >
        <Row className="items-start gap-2">
          <ShieldCheckIcon className="text-scarlet-500 mt-0.5 h-5 w-5 shrink-0" />
          <span className="text-ink-700 flex-1 text-sm">
            Identity verification was unsuccessful, so commenting on other
            users' markets is unavailable. Email{' '}
            <a
              href="mailto:info@manifold.markets"
              className="text-primary-700 font-semibold hover:underline"
            >
              info@manifold.markets
            </a>{' '}
            if you think this is a mistake.
          </span>
        </Row>
      </Col>
    )
  }

  // Market comments (allowPurchasedMana) show the 3-CTA prompt with a countdown.
  // Post-comment prompts keep the simpler verify-only flow.
  if (!allowPurchasedMana) {
    return (
      <Col
        className={clsx(
          className,
          'border-primary-300 bg-primary-50 mb-2 w-full rounded-lg border p-3'
        )}
      >
        <Row className="items-center gap-2">
          <ShieldCheckIcon className="text-primary-500 h-5 w-5 shrink-0" />
          <span className="text-ink-700 flex-1 text-sm">
            Verify your identity to comment and get{' '}
            <span className="font-semibold">
              {formatMoney(STARTING_BALANCE, 'MANA')}
            </span>
          </span>
          <Button
            size="xs"
            onClick={handleVerify}
            loading={loading}
            className="shrink-0"
          >
            Verify now
          </Button>
        </Row>
        {error && <div className="text-scarlet-500 mt-1 text-xs">{error}</div>}
      </Col>
    )
  }

  const unlocksAt = user.createdTime + NEW_USER_COMMENT_GATE_MS
  const countdown = useCountdown(unlocksAt)

  return (
    <Col
      className={clsx(
        className,
        'border-primary-300 bg-primary-50 mb-2 w-full gap-2 rounded-lg border p-3'
      )}
    >
      <Row className="items-center gap-2">
        <ShieldCheckIcon className="text-primary-500 h-5 w-5 shrink-0" />
        <Col className="flex-1 text-sm">
          <span className="text-ink-700">
            Commenting unlocks in{' '}
            <span className="font-semibold tabular-nums">{countdown}</span>.
          </span>
          <span className="text-ink-600">
            Unlock now:{' '}
            <button
              onClick={handleVerify}
              disabled={loading}
              className="text-primary-700 font-semibold hover:underline disabled:opacity-50"
            >
              verify
            </button>
            ,{' '}
            <Link
              href="/add-funds"
              className="text-primary-700 font-semibold hover:underline"
              onClick={() => track('comment gate: buy mana clicked')}
            >
              buy any amount of mana
            </Link>
            , or{' '}
            <Link
              href="/membership"
              className="text-primary-700 font-semibold hover:underline"
              onClick={() => track('comment gate: subscribe clicked')}
            >
              subscribe
            </Link>
            .
          </span>
        </Col>
      </Row>
      {error && <div className="text-scarlet-500 mt-1 text-xs">{error}</div>}
    </Col>
  )
}

function useCountdown(targetMs: number): string {
  const isClient = useIsClient()
  const [now, setNow] = useState(targetMs)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  // Date.now() differs between the server render and the first client render,
  // so reading it during hydration trips a mismatch. Render a stable
  // placeholder until mounted, then swap in the live countdown.
  if (!isClient) return 'a moment'
  const remaining = Math.max(0, targetMs - now)
  if (remaining <= 0) return 'a moment'
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  const hours = Math.floor(
    (remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
  )
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
  const secs = Math.floor((remaining % (60 * 1000)) / 1000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

export function ContractCommentInput(props: {
  playContract: Contract
  autoFocus: boolean
  className?: string
  replyTo?: Answer | Bet
  replyToUserInfo?: ReplyToUserInfo
  parentCommentId?: string
  clearReply?: () => void
  trackingLocation: string
  onSubmit?: (comment: ContractComment) => void
  commentTypes: CommentType[]
  onClearInput?: () => void
  commenterUserIds?: string[] // user IDs of commenters to prioritize in mentions (after creator)
}) {
  const {
    playContract,
    autoFocus,
    replyTo,
    parentCommentId,
    className,
    clearReply,
    trackingLocation,
    onSubmit,
    commentTypes,
    onClearInput,
    commenterUserIds,
  } = props
  const user = useUser()
  const privateUser = usePrivateUser()
  const isReplyToBet = replyTo && 'amount' in replyTo
  const isReplyToAnswer = replyTo && !isReplyToBet
  const replyToUserInfo =
    useDisplayUserById(replyTo?.userId) ?? props.replyToUserInfo
  const onSubmitComment = useEvent(
    async (editor: Editor, type: CommentType) => {
      if (!user) return

      let comment: ContractComment | undefined
      if (type === 'comment') {
        comment = await api('comment', {
          contractId: playContract.id,
          content: editor.getJSON(),
          replyToAnswerId: isReplyToAnswer ? replyTo.id : undefined,
          replyToCommentId: parentCommentId,
          replyToBetId: isReplyToBet ? replyTo.id : undefined,
        })
      } else {
        comment = await api('post', {
          contractId: playContract.id,
          content: editor.getJSON(),
          betId: isReplyToBet ? replyTo.id : undefined,
        })
        if (comment) toast.success('Reposted to your followers!')
      }
      clearReply?.()
      onSubmit?.(comment)
      await track(type, {
        location: trackingLocation,
        replyTo: isReplyToBet
          ? 'bet'
          : isReplyToAnswer
          ? 'answer'
          : replyToUserInfo
          ? 'user'
          : undefined,
        commentId: comment.id,
        contractId: playContract.id,
      })
    }
  )

  const { answer: betAnswer } = useAnswer(
    isReplyToBet ? replyTo.answerId : undefined
  )

  return (
    <>
      {isReplyToBet ? (
        <ReplyToBetRow
          commenterIsBettor={replyTo?.userId === user?.id}
          betAmount={replyTo.amount}
          betOutcome={replyTo.outcome}
          bettorId={replyTo.userId}
          betOrderAmount={replyTo.orderAmount}
          betLimitProb={replyTo.limitProb}
          betAnswer={betAnswer}
          contract={playContract}
          clearReply={clearReply}
        />
      ) : replyTo ? (
        <CommentOnAnswer answer={replyTo} clear={clearReply} />
      ) : null}

      <CommentInput
        autoFocus={autoFocus}
        replyToUserInfo={replyToUserInfo}
        parentCommentId={parentCommentId}
        onSubmitComment={onSubmitComment}
        pageId={playContract.id + commentTypes.join(', ')}
        className={className}
        blocked={isBlocked(privateUser, playContract.creatorId)}
        placeholder={
          replyTo || parentCommentId
            ? 'Write a reply ...'
            : playContract.outcomeType === 'BOUNTIED_QUESTION'
            ? 'Write an answer or comment'
            : undefined
        }
        commentTypes={commentTypes}
        onClearInput={onClearInput}
        priorityUserIds={[playContract.creatorId, ...(commenterUserIds ?? [])]}
        allowPurchasedMana
      />
    </>
  )
}
