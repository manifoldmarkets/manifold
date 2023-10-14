import { Contract } from 'common/contract'
import { isTrustworthy } from 'common/envs/constants'
import { useEffect } from 'react'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { Button } from '../buttons/button'
import { DeleteMarketButton } from '../buttons/delete-market-button'
import { Row } from '../layout/row'
import { WEEK_MS } from 'common/util/time'

export function DangerZone(props: {
  contract: Contract
  showResolver: boolean
  setShowResolver: (showResolver: boolean) => void
  showReview: boolean
  setShowReview: (showReview: boolean) => void
  userHasBet: boolean
}) {
  const {
    contract,
    showResolver,
    setShowResolver,
    showReview,
    setShowReview,
    userHasBet,
  } = props
  const {
    closeTime,
    creatorId,
    outcomeType,
    mechanism,
    isResolved,
    resolution,
    uniqueBettorCount,
  } = contract

  const isAdmin = useAdmin()
  const user = useUser()
  const isCreator = user?.id === creatorId
  const isClosed = !!closeTime && closeTime < Date.now()
  const trustworthy = isTrustworthy(user?.username)

  const canReview =
    !!user &&
    !isCreator &&
    isResolved &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none'

  const canDelete =
    isCreator &&
    isResolved &&
    resolution === 'CANCEL' &&
    (!uniqueBettorCount || uniqueBettorCount < 2)

  const canResolve =
    (isCreator || isAdmin || trustworthy) &&
    !isResolved &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none'

  useEffect(() => {
    if (
      canReview &&
      userHasBet &&
      // resolved less than week ago
      Date.now() - (contract.resolutionTime ?? 0) < WEEK_MS
    ) {
      setShowReview(true)
    }
  }, [canReview, userHasBet, contract.resolutionTime])

  useEffect(() => {
    // Close resolve panel if you just resolved it.
    if (isResolved) setShowResolver(false)
    // open by default if it is closed
    else if (canResolve && isClosed) {
      setShowResolver(true)
    }
  }, [isAdmin, isCreator, trustworthy, closeTime, isResolved])

  const highlightResolver = isClosed && !showResolver

  if (!user) return null
  if (!canReview && !canDelete && !canResolve) return null

  return (
    <Row className="my-2 w-full flex-wrap justify-end gap-2">
      {canReview && !showReview && (
        <Button
          color="gray"
          size="2xs"
          className="self-end"
          onClick={() => setShowReview(true)}
        >
          Review
        </Button>
      )}

      {canDelete && <DeleteMarketButton contractId={contract.id} />}
      {canResolve && !showResolver && (
        <Button
          color={highlightResolver ? 'red' : 'gray'}
          size="2xs"
          onClick={() => setShowResolver(!showResolver)}
        >
          {isCreator
            ? 'Resolve'
            : isAdmin
            ? 'Admin resolve'
            : trustworthy
            ? 'Trustworthy resolve'
            : ''}
        </Button>
      )}
    </Row>
  )
}
