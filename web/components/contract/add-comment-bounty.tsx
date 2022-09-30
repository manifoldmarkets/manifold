import { Contract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { addCommentBounty } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'
import { Button } from 'web/components/button'

export function AddCommentBountyPanel(props: { contract: Contract }) {
  const { contract } = props
  const { id: contractId, slug } = contract

  const user = useUser()
  const amount = COMMENT_BOUNTY_AMOUNT
  const totalAdded = contract.openCommentBounties ?? 0
  const [error, setError] = useState<string | undefined>(undefined)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const submit = () => {
    if ((user?.balance ?? 0) < amount) {
      setError('Insufficient balance')
      return
    }

    setIsLoading(true)
    setIsSuccess(false)

    addCommentBounty({ amount, contractId })
      .then((_) => {
        track('offer comment bounty', {
          amount,
          contractId,
        })
        setIsSuccess(true)
        setError(undefined)
        setIsLoading(false)
      })
      .catch((_) => setError('Server error'))

    track('add comment bounty', { amount, contractId, slug })
  }

  return (
    <>
      <div className="mb-4 text-gray-500">
        Add a {formatMoney(amount)} bounty for good comments that the creator
        can award.{' '}
        {totalAdded > 0 && `(${formatMoney(totalAdded)} currently added)`}
      </div>

      <Row className={'items-center gap-2'}>
        <Button
          className={clsx('ml-2', isLoading && 'btn-disabled')}
          onClick={submit}
          disabled={isLoading}
          color={'blue'}
        >
          Add {formatMoney(amount)} bounty
        </Button>
        <span className={'text-error'}>{error}</span>
      </Row>

      {isSuccess && amount && (
        <div>Success! Added {formatMoney(amount)} in bounties.</div>
      )}

      {isLoading && <div>Processing...</div>}
    </>
  )
}
