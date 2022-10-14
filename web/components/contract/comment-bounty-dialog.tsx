import { Contract } from 'common/contract'
import { useUser } from 'web/hooks/use-user'
import { useState } from 'react'
import { addCommentBounty } from 'web/lib/firebase/api'
import { track } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'
import { formatMoney } from 'common/util/format'
import { COMMENT_BOUNTY_AMOUNT } from 'common/economy'
import { Button } from 'web/components/buttons/button'
import { Title } from '../widgets/title'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'

export function CommentBountyDialog(props: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { contract, open, setOpen } = props
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
    <Modal open={open} setOpen={setOpen}>
      <Col className="gap-4 rounded bg-white p-6">
        <Title className="!mt-0 !mb-0" text="Comment bounty" />

        <div className="mb-4 text-gray-500">
          Add a {formatMoney(amount)} bounty for good comments that the creator
          can award.{' '}
          {totalAdded > 0 && `(${formatMoney(totalAdded)} currently added)`}
        </div>

        <Row className={'items-center gap-2'}>
          <Button
            className="ml-2"
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
      </Col>
    </Modal>
  )
}
