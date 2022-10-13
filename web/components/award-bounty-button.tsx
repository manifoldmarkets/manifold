import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { useUser } from 'web/hooks/use-user'
import { awardCommentBounty } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Row } from './layout/row'
import { Contract } from 'common/contract'
import { TextButton } from 'web/components/text-button'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'
import { formatMoney } from 'common/util/format'

export function AwardBountyButton(prop: {
  comment: ContractComment
  contract: Contract
}) {
  const { comment, contract } = prop

  const me = useUser()

  const submit = () => {
    const data = {
      amount: COMMENT_BOUNTY_AMOUNT,
      commentId: comment.id,
      contractId: contract.id,
    }

    awardCommentBounty(data)
      .then((_) => {
        console.log('success')
        track('award comment bounty', data)
      })
      .catch((reason) => console.log('Server error:', reason))

    track('award comment bounty', data)
  }

  const canUp = me && me.id !== comment.userId && contract.creatorId === me.id
  if (!canUp) return <div />
  return (
    <Row
      className={clsx('my-auto items-center gap-0.5', !canUp ? '-ml-6' : '')}
    >
      <button
        className={
          'rounded-full border border-indigo-400 bg-indigo-50 py-0.5 px-2 text-xs text-indigo-400 transition-colors hover:bg-indigo-400 hover:text-white'
        }
        onClick={submit}
      >
        Award {formatMoney(COMMENT_BOUNTY_AMOUNT)}
      </button>
    </Row>
  )
}
