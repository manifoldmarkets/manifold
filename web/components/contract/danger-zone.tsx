import { Contract, MINUTES_ALLOWED_TO_UNRESOLVE } from 'common/contract'
import { WEEK_MS } from 'common/util/time'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import {
  useAdmin,
  useSweepstakesTrusted,
  useTrusted,
} from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { Button } from '../buttons/button'
import { DeleteMarketButton } from '../buttons/delete-market-button'
import { UnresolveButton } from '../buttons/unresolve-button'
import { Row } from '../layout/row'

export function DangerZone(props: {
  contract: Contract
  showResolver: boolean
  setShowResolver: (showResolver: boolean) => void
  showUnresolver: boolean
  setShowUnresolver: (showUnresolver: boolean) => void
  showReview: boolean
  setShowReview: (showReview: boolean) => void
  userHasBet: boolean
  hasReviewed?: boolean
}) {
  const {
    contract,
    showResolver,
    setShowResolver,
    showUnresolver,
    setShowUnresolver,
    showReview,
    setShowReview,
    userHasBet,
    hasReviewed,
  } = props
  const {
    closeTime,
    creatorId,
    outcomeType,
    mechanism,
    isResolved,
    resolution,
    resolutionTime,
    resolverId,
    uniqueBettorCount,
    token,
  } = contract

  const isAdmin = useAdmin()
  const isMod = useTrusted()
  const isSweepstakesTrusted = useSweepstakesTrusted()
  const user = useUser()
  const isCreator = user?.id === creatorId
  const isClosed = !!closeTime && closeTime < Date.now()

  const canReview =
    !!user &&
    !isCreator &&
    isResolved &&
    resolverId === creatorId &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none' &&
    !hasReviewed

  const canUpdateReview =
    !!user &&
    !isCreator &&
    isResolved &&
    resolverId === creatorId &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none' &&
    hasReviewed

  const canDelete =
    isCreator &&
    isResolved &&
    resolution === 'CANCEL' &&
    (!uniqueBettorCount || uniqueBettorCount < 2)

  const canResolve =
    !isResolved &&
    outcomeType !== 'STONK' &&
    mechanism !== 'none' &&
    (token === 'CASH' ? isSweepstakesTrusted : isCreator || isAdmin || isMod)

  const now = dayjs().utc()
  const creatorCanUnresolve =
    isCreator &&
    resolutionTime &&
    now.diff(dayjs(resolutionTime), 'minute') < MINUTES_ALLOWED_TO_UNRESOLVE

  const isIndependentMulti =
    outcomeType === 'MULTIPLE_CHOICE' &&
    mechanism === 'cpmm-multi-1' &&
    'shouldAnswersSumToOne' in contract &&
    !contract.shouldAnswersSumToOne
  const hasResolvedIndependentAnswers =
    isIndependentMulti &&
    'answers' in contract &&
    contract.answers.some((answer) => !!answer.resolution)

  const canUnresolve =
    isResolved &&
    !isIndependentMulti &&
    (token === 'CASH'
      ? isAdmin
      : isAdmin || isMod || (isCreator && creatorCanUnresolve))

  const canUnresolveIndependentAnswers =
    hasResolvedIndependentAnswers &&
    (token === 'CASH' ? isAdmin : isAdmin || isMod || isCreator)

  useEffect(() => {
    if (
      canReview &&
      userHasBet &&
      Date.now() - (contract.resolutionTime ?? 0) < WEEK_MS
    ) {
      setShowReview(true)
    } else {
      setShowReview(false)
    }
  }, [canReview, userHasBet, contract.resolutionTime])

  useEffect(() => {
    // Close resolve panel if you just resolved it.
    if (isResolved) setShowResolver(false)
    // open by default if it is closed
    else if (canResolve && isClosed) {
      setShowResolver(true)
    }
  }, [isAdmin, isCreator, isMod, closeTime, isResolved])

  const highlightResolver = isClosed && !showResolver

  if (!user) return null
  if (
    !canReview &&
    !canUpdateReview &&
    !canDelete &&
    !canResolve &&
    !canUnresolve &&
    !canUnresolveIndependentAnswers
  )
    return null

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

      {canUpdateReview && !showReview && (
        <Button
          color="gray"
          size="2xs"
          className="self-end"
          onClick={() => setShowReview(true)}
        >
          Update Review
        </Button>
      )}

      {canDelete && <DeleteMarketButton contractId={contract.id} />}
      {canResolve && !showResolver && (
        <Button
          color={highlightResolver ? 'indigo' : 'gray'}
          size="xs"
          onClick={() => {
            setShowUnresolver(false)
            setShowResolver(!showResolver)
          }}
        >
          {isCreator
            ? 'Resolve'
            : isAdmin
            ? 'Admin resolve'
            : isMod
            ? 'Mod resolve'
            : ''}
        </Button>
      )}
      {canUnresolve && <UnresolveButton contractId={contract.id} />}
      {canUnresolveIndependentAnswers && (
        <>
          <Button
            size="2xs"
            color="gray"
            onClick={() => {
              setShowResolver(false)
              setShowUnresolver(!showUnresolver)
            }}
          >
            Unresolve
          </Button>
        </>
      )}
    </Row>
  )
}
