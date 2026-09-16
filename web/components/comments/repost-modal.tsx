import { formatMoney } from 'common/util/format'
import clsx from 'clsx'
import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { ChatAlt2Icon } from '@heroicons/react/outline'
import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { richTextToString } from 'common/util/parse'
import { socialPostPath } from 'common/social-post'
import { Button, SizeType } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Tooltip } from 'web/components/widgets/tooltip'
import { SocialComposer } from '../yap/social-composer'

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
  playContract: Contract
  bet?: Bet
  comment?: ContractComment
  initialText?: string
  onPosted?: () => void
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { playContract, bet, comment, open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <div className="bg-canvas-0 rounded-xl">
        <h2 className="px-4 pt-4 text-lg font-semibold">Post to Yap</h2>
        {(comment || bet) && (
          <a
            href={
              contractPath(playContract) + (comment ? '#' + comment.id : '')
            }
            className="text-ink-500 mx-4 mt-3 block whitespace-pre-wrap rounded-lg border p-3 text-sm hover:underline"
          >
            {comment
              ? richTextToString(comment.content).slice(0, 300)
              : `Trade: ${formatMoney(
                  Math.abs(bet!.amount),
                  playContract.token
                )} on ${bet!.outcome}. View market`}
          </a>
        )}
        {playContract.visibility === 'public' && !playContract.deleted ? (
          <SocialComposer
            initialMarkets={[playContract]}
            initialText={props.initialText}
            source={{
              contractId: playContract.id,
              betId: bet?.id,
              commentId: comment?.id,
            }}
            focusOnMount
            onCancel={() => setOpen(false)}
            onPosted={(post) => {
              props.onPosted?.()
              setOpen(false)
              toast.success(
                <span>
                  Posted to Yap.{' '}
                  <Link
                    className="text-primary-700 underline"
                    href={socialPostPath(post.id)}
                  >
                    View post
                  </Link>
                </span>
              )
            }}
          />
        ) : (
          <p className="p-4">Only public markets can be shared on Yap.</p>
        )}
      </div>
    </Modal>
  )
}
