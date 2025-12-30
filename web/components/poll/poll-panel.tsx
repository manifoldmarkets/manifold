import { ArrowRightIcon, CheckIcon, StarIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import {
  PollContract,
  PollType,
  PollVoterVisibility,
  contractPath,
} from 'common/contract'
import { PollOption } from 'common/poll-option'
import { maybePluralize } from 'common/util/format'
import { sortBy, sumBy } from 'lodash'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { castPollVote } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { getUserVote } from 'web/lib/supabase/polls'
import { AnswerBar } from '../answers/answer-components'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { UserHovercard } from '../user/user-hovercard'
import { Avatar } from '../widgets/avatar'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Tooltip } from '../widgets/tooltip'
import { UserLink } from '../widgets/user-link'

export function PollPanel(props: {
  contract: PollContract
  maxOptions?: number
  showResults?: boolean
}) {
  const { contract, maxOptions } = props
  const {
    options,
    closeTime,
    voterVisibility = 'everyone',
    pollType = 'single',
    maxSelections,
  } = contract
  const totalVotes = sumBy(options, (option) => option.votes)
  const votingOpen = !closeTime || closeTime > Date.now()

  const [hasVoted, setHasVoted] = useState<boolean | undefined>(undefined)
  const [userVotedIds, setUserVotedIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // For multi-select: track selected options before submission
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // For ranked-choice: track ranked options in order
  const [rankedIds, setRankedIds] = useState<string[]>([])

  const user = useUser()
  const authed = useIsAuthorized()
  const isCreator = user?.id === contract.creatorId

  const effectiveMaxSelections = maxSelections ?? options.length

  useEffect(() => {
    if (!user || !authed) {
      setHasVoted(false)
      setUserVotedIds([])
    } else {
      getUserVote(contract.id, user?.id).then((result) => {
        if (!result) {
          setHasVoted(false)
          setUserVotedIds([])
        } else {
          setHasVoted(true)
          // result could be a single id or array depending on poll type
          setUserVotedIds(Array.isArray(result) ? result : [result])
        }
      })
    }
  }, [contract.id, user, authed])

  const shouldShowResults = useMemo(() => {
    if (isCreator) return true
    if (hasVoted) return true
    if (!votingOpen) return true
    return false
  }, [hasVoted, votingOpen, isCreator])

  // Determine which score to show for ranking
  const getDisplayScore = useCallback(
    (option: PollOption) => {
      if (pollType === 'ranked-choice') {
        return option.rankedVoteScore ?? 0
      }
      return option.votes
    },
    [pollType]
  )

  // Sort options for display when showing results
  const sortedOptions = useMemo(() => {
    if (!shouldShowResults) return options
    if (pollType === 'ranked-choice') {
      return sortBy(options, (o) => -(o.rankedVoteScore ?? 0))
    }
    return sortBy(options, (o) => -o.votes)
  }, [options, shouldShowResults, pollType])

  const castVote = async () => {
    if (!user) {
      firebaseLogin()
      return
    }

    setIsSubmitting(true)

    try {
      if (pollType === 'single') {
        // Single vote handled by clicking on an option
        return
      } else if (pollType === 'multi-select') {
        await castPollVote({ contractId: contract.id, voteIds: selectedIds })
      } else if (pollType === 'ranked-choice') {
        await castPollVote({
          contractId: contract.id,
          rankedVoteIds: rankedIds,
        })
      }
      setHasVoted(true)
      setUserVotedIds(pollType === 'ranked-choice' ? rankedIds : selectedIds)
    } finally {
      setIsSubmitting(false)
    }
  }

  const castSingleVote = async (voteId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    setIsSubmitting(true)
    setUserVotedIds([voteId])
    try {
      await castPollVote({ contractId: contract.id, voteId })
      setHasVoted(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleSelection = (optionId: string) => {
    if (pollType === 'multi-select') {
      setSelectedIds((prev) => {
        if (prev.includes(optionId)) {
          return prev.filter((id) => id !== optionId)
        }
        if (prev.length >= effectiveMaxSelections) {
          return prev
        }
        return [...prev, optionId]
      })
    } else if (pollType === 'ranked-choice') {
      setRankedIds((prev) => {
        if (prev.includes(optionId)) {
          return prev.filter((id) => id !== optionId)
        }
        return [...prev, optionId]
      })
    }
  }

  const getRankDisplay = (optionId: string) => {
    const rank = rankedIds.indexOf(optionId)
    if (rank === -1) return null
    return rank + 1
  }

  const optionsToShow = maxOptions
    ? sortedOptions.slice(0, maxOptions)
    : sortedOptions

  const canSubmit =
    (pollType === 'multi-select' && selectedIds.length > 0) ||
    (pollType === 'ranked-choice' && rankedIds.length > 0)

  return (
    <Col className="text-ink-1000 gap-2">
      {/* Poll type indicator */}
      {pollType !== 'single' && (
        <div className="text-ink-500 mb-1 text-sm">
          {pollType === 'multi-select' && (
            <>
              Select up to {effectiveMaxSelections}{' '}
              {maybePluralize('option', effectiveMaxSelections)}
            </>
          )}
          {pollType === 'ranked-choice' && (
            <>Rank options in order of preference</>
          )}
        </div>
      )}

      {optionsToShow.map((option: PollOption) => {
        const prob =
          pollType === 'ranked-choice'
            ? totalVotes === 0
              ? 0
              : (option.rankedVoteScore ?? 0) /
                (totalVotes * options.length || 1)
            : option.votes === 0
            ? 0
            : option.votes / totalVotes

        const isSelected =
          pollType === 'multi-select'
            ? selectedIds.includes(option.id)
            : pollType === 'ranked-choice'
            ? rankedIds.includes(option.id)
            : false

        const rank =
          pollType === 'ranked-choice' ? getRankDisplay(option.id) : null

        return (
          <AnswerBar
            key={option.id}
            color={'#818cf8'} // indigo-400
            prob={prob}
            resolvedProb={
              contract.isResolved &&
              contract.resolutions?.some((s) => s == option.id)
                ? 1
                : undefined
            }
            label={
              <Row className="items-center gap-2">
                {/* Show rank number for ranked-choice */}
                {pollType === 'ranked-choice' && rank && !hasVoted && (
                  <span className="bg-primary-500 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white">
                    {rank}
                  </span>
                )}
                {/* Show checkmark for multi-select */}
                {pollType === 'multi-select' && isSelected && !hasVoted && (
                  <CheckIcon className="text-primary-500 h-4 w-4" />
                )}
                <div>{option.text}</div>
              </Row>
            }
            end={
              <Row className="gap-3">
                {(hasVoted || !votingOpen || isCreator) && (
                  <SeeVotesButton
                    option={option}
                    contractId={contract.id}
                    userVotedIds={userVotedIds}
                    voterVisibility={voterVisibility}
                    isCreator={isCreator}
                    pollType={pollType}
                  />
                )}
                {!hasVoted && votingOpen && pollType === 'single' && (
                  <VoteButton
                    loading={isSubmitting && userVotedIds[0] === option.id}
                    onClick={() => castSingleVote(option.id)}
                    disabled={isSubmitting}
                  />
                )}
                {!hasVoted && votingOpen && pollType !== 'single' && (
                  <Button
                    size="2xs"
                    color={isSelected ? 'indigo' : 'indigo-outline'}
                    className="!ring-1"
                    onClick={(e) => {
                      e.preventDefault()
                      toggleSelection(option.id)
                    }}
                  >
                    {isSelected ? 'Selected' : 'Select'}
                  </Button>
                )}
              </Row>
            }
            hideBar={!shouldShowResults}
            className={'min-h-[40px]'}
          />
        )
      })}

      {/* Submit button for multi-select and ranked-choice */}
      {!hasVoted && votingOpen && pollType !== 'single' && (
        <Button
          onClick={castVote}
          loading={isSubmitting}
          disabled={!canSubmit || isSubmitting}
          color="indigo"
          className="mt-2 w-fit self-end"
        >
          Submit{' '}
          {maybePluralize(
            'vote',
            pollType === 'multi-select' ? selectedIds.length : rankedIds.length
          )}
        </Button>
      )}

      {optionsToShow.length < options.length && (
        <Link
          className="text-ink-500 hover:text-primary-500"
          href={contractPath(contract)}
        >
          See {options.length - optionsToShow.length} more options{' '}
          <ArrowRightIcon className="inline h-4 w-4" />
        </Link>
      )}
    </Col>
  )
}

export function SeeVotesButton(props: {
  option: PollOption
  contractId: string
  userVotedIds?: string[]
  voterVisibility: PollVoterVisibility
  isCreator: boolean
  pollType?: PollType
}) {
  const {
    option,
    contractId,
    userVotedIds = [],
    voterVisibility,
    isCreator,
    pollType = 'single',
  } = props
  const [open, setOpen] = useState(false)
  const disabled = option.votes === 0

  const isUserVote = userVotedIds.includes(option.id)

  const canSeeVoters = useMemo(() => {
    if (voterVisibility === 'everyone') return true
    if (voterVisibility === 'creator' && isCreator) return true
    return false
  }, [voterVisibility, isCreator])

  // Display score based on poll type
  const displayValue =
    pollType === 'ranked-choice'
      ? `${option.rankedVoteScore ?? 0} pts`
      : `${option.votes} ${maybePluralize('vote', option.votes)}`

  return (
    <>
      {isUserVote && (
        <Tooltip text="You voted">
          <StarIcon className="h-4 w-4" />
        </Tooltip>
      )}
      <button
        className="disabled:text-ink-900/60 disabled:pointer-none hover:text-primary-700 group whitespace-nowrap transition-colors disabled:cursor-not-allowed"
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
        disabled={disabled || !canSeeVoters}
      >
        <span>{displayValue}</span>
      </button>
      <Modal open={open} setOpen={setOpen}>
        <SeeVotesModalContent
          option={option}
          contractId={contractId}
          canSeeVoters={canSeeVoters}
        />
      </Modal>
    </>
  )
}

export function SeeVotesModalContent(props: {
  option: PollOption
  contractId: string
  canSeeVoters: boolean
}) {
  const { option, contractId, canSeeVoters } = props
  const { data: voters } = useAPIGetter('get-contract-option-voters', {
    contractId,
    optionId: option.id,
  })

  return (
    <Col className={clsx(MODAL_CLASS)}>
      <div className="line-clamp-2 w-full">
        Votes on <b>{option.text}</b>
      </div>
      <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'w-full gap-2')}>
        {!canSeeVoters ? (
          <div className="text-ink-700">
            Voter identities are private for this poll.
          </div>
        ) : !voters ? (
          <LoadingIndicator />
        ) : voters.length == 0 ? (
          'No votes yet...'
        ) : (
          voters.map((voter) => {
            return (
              <UserHovercard userId={voter.id} key={voter.id}>
                <Row className="w-full items-center gap-2">
                  <Avatar
                    username={voter.username}
                    avatarUrl={voter.avatarUrl}
                    size={'sm'}
                  />
                  <UserLink user={voter} />
                </Row>
              </UserHovercard>
            )
          })
        )}
      </Col>
    </Col>
  )
}

export function VoteButton(props: {
  loading: boolean
  onClick: () => void
  disabled: boolean
}) {
  const { loading, onClick, disabled } = props
  return (
    <Button
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
      size="2xs"
      loading={loading}
      color="indigo-outline"
      className="!ring-1"
      disabled={disabled}
    >
      Vote
    </Button>
  )
}
