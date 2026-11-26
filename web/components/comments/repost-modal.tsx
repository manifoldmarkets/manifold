import { quoteSocialPost, SocialPost, SocialQuote } from 'common/social-post'
import { formatMoney } from 'common/util/format'
import clsx from 'clsx'
import { useState } from 'react'
import { ChatAlt2Icon } from '@heroicons/react/outline'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { SocialRichContent } from 'common/social-rich-content'
import { richTextToString } from 'common/util/parse'
import { Button, SizeType } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { SocialComposer } from '../yap/social-composer'
import { api } from 'web/lib/api/api'
import { SocialQuoteCard } from '../yap/social-quote-card'
import { BiRepost } from 'react-icons/bi'

export const RepostButton = (props: {
  playContract: Contract
  bet?: Bet
  size: SizeType
  className?: string
  iconClassName?: string
}) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip text="Post to Yap" placement="bottom" noTap>
        <Button
          color="gray-white"
          size={props.size}
          className={props.className}
          aria-label="Post to Yap"
          onClick={() => setOpen(true)}
        >
          <ChatAlt2Icon className={clsx(props.iconClassName, 'h-6 w-6')} />
        </Button>
      </Tooltip>
      {open && (
        <RepostModal
          playContract={props.playContract}
          bet={props.bet}
          open={open}
          setOpen={setOpen}
        />
      )}
    </>
  )
}
export const RepostModal = (props: {
  playContract?: Contract
  post?: SocialPost
  bet?: Bet
  comment?: ContractComment
  replyToCommentId?: string
  quoteMode?: boolean
  initialText?: string
  initialRichContent?: SocialRichContent | null
  onPosted?: () => void
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { playContract, post, bet, comment, open, setOpen } = props
  const [mode, setMode] = useState<'choose' | 'quote' | 'draft'>(
    props.quoteMode
      ? 'quote'
      : props.initialText || props.initialRichContent
      ? 'draft'
      : 'choose'
  )
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string>()
  const source = post
    ? { postId: post.id }
    : playContract
    ? {
        contractId: playContract.id,
        betId: bet?.id,
        commentId: comment?.id ?? props.replyToCommentId,
      }
    : undefined
  const quote: SocialQuote | undefined = post
    ? quoteSocialPost(post)
    : playContract && (comment || bet)
    ? {
        kind: comment ? 'comment' : 'bet',
        ...(comment?.isAiComment ? { isAiComment: true } : {}),
        contractId: playContract.id,
        url: contractPath(playContract) + (comment ? '#' + comment.id : ''),
        text: comment
          ? richTextToString(comment.content).slice(0, 300)
          : `Trade: ${formatMoney(
              Math.abs(bet!.amount),
              playContract.token
            )} on ${bet!.outcome}. View market`,
        author: comment
          ? {
              id: comment.userId,
              name: comment.userName,
              username: comment.userUsername,
              avatarUrl: comment.userAvatarUrl ?? '',
            }
          : undefined,
      }
    : undefined
  return (
    <Modal open={open} setOpen={setOpen}>
      <div className="bg-canvas-0 rounded-xl">
        <h2 className="px-4 pt-4 text-lg font-semibold">
          {mode === 'quote'
            ? 'Quote on Yap'
            : mode === 'draft'
            ? 'Post to Yap'
            : 'Share on Yap'}
        </h2>
        {(post && !post.removed) ||
        (playContract?.visibility === 'public' && !playContract.deleted) ? (
          mode === 'choose' ? (
            <div className="space-y-4 p-4">
              {quote ? (
                <SocialQuoteCard quote={quote} />
              ) : (
                <p className="font-medium">{playContract?.question}</p>
              )}
              <p className="text-ink-500 text-sm">
                Re-Yap shares this item with its existing discussion. Quote adds
                your thoughts in a new post.
              </p>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="flex gap-3">
                <Button
                  loading={sharing}
                  onClick={async () => {
                    if (!source || sharing) return
                    setSharing(true)
                    setError(undefined)
                    try {
                      await api('repost-social-post', { source, remove: false })
                      props.onPosted?.()
                      setOpen(false)
                    } catch (e) {
                      setError((e as Error).message)
                    } finally {
                      setSharing(false)
                    }
                  }}
                >
                  <BiRepost className="mr-2 h-5 w-5" />
                  Re-Yap
                </Button>
                <Button color="gray" onClick={() => setMode('quote')}>
                  Quote
                </Button>
              </div>
            </div>
          ) : (
            <SocialComposer
              quoteOnly={mode === 'quote'}
              initialMarkets={playContract ? [playContract] : []}
              quote={quote}
              initialText={props.initialText}
              initialRichContent={props.initialRichContent}
              source={source}
              focusOnMount
              onCancel={() => setOpen(false)}
              onPosted={() => {
                props.onPosted?.()
                setOpen(false)
              }}
            />
          )
        ) : (
          <p className="p-4">
            {post
              ? 'This post is unavailable.'
              : 'Only public markets can be shared on Yap.'}
          </p>
        )}
      </div>
    </Modal>
  )
}
