import { PollContract, contractPath } from 'common/contract'
import { PollOption } from 'common/poll-option'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { castPollVote } from 'web/lib/firebase/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { AnswerBar } from '../answers/answer-item'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { sumBy } from 'lodash'
import Link from 'next/link'
import { ArrowRightIcon, StarIcon } from '@heroicons/react/solid'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import clsx from 'clsx'
import { useOptionVoters } from 'web/hooks/use-votes'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { Spacer } from '../layout/spacer'
import { getUserVote } from 'web/lib/supabase/polls'
import { Tooltip } from '../widgets/tooltip'

export function PollPanel(props: {
  contract: PollContract
  maxOptions?: number
}) {
  const { contract, maxOptions } = props
  const { options, closeTime } = contract
  const totalVotes = sumBy(options, (option) => option.votes)
  const votingOpen = !closeTime || closeTime > Date.now()
  const [hasVoted, setHasVoted] = useState<boolean | undefined>(undefined)
  const [userVotedId, setUserVotedId] = useState<string | undefined>(undefined)

  const user = useUser()
  useEffect(() => {
    if (!user) {
      setHasVoted(false)
      setUserVotedId(undefined)
    } else {
      getUserVote(contract.id, user?.id).then((result) => {
        if (!result) {
          setHasVoted(false)
          setUserVotedId(undefined)
        } else {
          setHasVoted(true)
          setUserVotedId(result)
        }
      })
    }
  }, [contract.id, user])

  const castVote = (voteId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    setUserVotedId(voteId)
    castPollVote({ contractId: contract.id, voteId: voteId }).then(() => {
      setHasVoted(true)
    })
  }

  const optionsToShow = maxOptions ? options.slice(0, maxOptions) : options

  return (
    <Col className="text-ink-1000 gap-2">
      {optionsToShow.map((option: PollOption) => {
        const prob = option.votes === 0 ? 0 : option.votes / totalVotes

        return (
          <AnswerBar
            key={option.id}
            color={'#6366f1b3'}
            prob={prob}
            resolvedProb={
              contract.isResolved &&
              contract.resolutions?.some((s) => s == option.id)
                ? 1
                : undefined
            }
            label={<div>{option.text}</div>}
            end={
              <>
                {(hasVoted || !votingOpen) && (
                  <SeeVotesButton
                    option={option}
                    contractId={contract.id}
                    userVotedId={userVotedId}
                  />
                )}
                {!hasVoted && votingOpen && (
                  <VoteButton
                    loading={!!userVotedId && userVotedId === option.id}
                    onClick={() => castVote(option.id)}
                    disabled={!!userVotedId}
                  />
                )}
              </>
            }
            hideBar={!hasVoted && !!closeTime && closeTime > Date.now()}
            className={'min-h-[40px]'}
          />
        )
      })}
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
  userVotedId?: string
}) {
  const { option, contractId, userVotedId } = props
  const [open, setOpen] = useState(false)
  const disabled = option.votes === 0
  return (
    <>
      {option.id == userVotedId && (
        <Tooltip text="You voted">
          <StarIcon className="h-4 w-4" />
        </Tooltip>
      )}
      <button
        className="disabled:text-ink-900/60 disabled:pointer-none group whitespace-nowrap transition-colors hover:text-indigo-800 disabled:cursor-not-allowed hover:dark:text-indigo-300"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <span>{option.votes}</span>{' '}
        <span className={clsx('text-xs opacity-80')}>votes</span>
      </button>
      <Modal open={open} setOpen={setOpen}>
        <SeeVotesModalContent option={option} contractId={contractId} />
      </Modal>
    </>
  )
}

export function SeeVotesModalContent(props: {
  option: PollOption
  contractId: string
}) {
  const { option, contractId } = props
  const voters = useOptionVoters(contractId, option.id)
  return (
    <Col className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}>
      <div className="bg-canvas-0 fixed inset-x-0 top-0 z-40 w-full rounded-t-md py-2 px-4 sm:px-8">
        Votes on <b>{option.text}</b>
      </div>
      <Spacer h={2} />
      {!voters ? (
        <LoadingIndicator />
      ) : voters.length == 0 ? (
        'No votes yet...'
      ) : (
        voters.map((voter) => {
          return (
            <Row className="w-full items-center gap-2" key={voter.id}>
              <Avatar
                username={voter.username}
                avatarUrl={voter.avatarUrl}
                size={'sm'}
              />
              <UserLink name={voter.name} username={voter.username} />
            </Row>
          )
        })
      )}
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
      onClick={onClick}
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
