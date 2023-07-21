import { PollContract } from 'common/contract'
import { PollOption } from 'common/poll-option'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { castPollVote } from 'web/lib/firebase/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { getHasVoted } from 'web/lib/supabase/polls'
import { AnswerBar } from '../answers/answer-item'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { sumBy } from 'lodash'

export function PollPanel(props: { contract: PollContract }) {
  const { contract } = props
  const { options, closeTime } = contract
  const totalVotes = sumBy(options, (option) => option.votes)
  const votingOpen = !closeTime || closeTime > Date.now()
  const [hasVoted, setHasVoted] = useState<boolean | undefined>(undefined)
  const user = useUser()
  useEffect(() => {
    if (!user) {
      setHasVoted(false)
    } else {
      getHasVoted(contract.id, user?.id).then((result) => {
        setHasVoted(result)
      })
    }
  }, [contract.id, user])
  const [votingId, setVotingId] = useState<string | undefined>(undefined)

  const castVote = (voteId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    setVotingId(voteId)
    castPollVote({ contractId: contract.id, voteId: voteId })
      .then(() => {
        setHasVoted(true)
      })
      .finally(() => {
        setVotingId(undefined)
      })
  }

  return (
    <Col className="gap-2">
      {options.map((option: PollOption) => {
        const prob = option.votes === 0 ? 0 : option.votes / totalVotes

        return (
          <AnswerBar
            key={option.id}
            color={'#6366f1b3'}
            prob={prob}
            resolvedProb={undefined}
            label={<div>{option.text}</div>}
            end={
              <>
                {hasVoted && (
                  <span className="whitespace-nowrap">
                    {option.votes}{' '}
                    <span className="text-ink-500 text-xs">votes</span>
                  </span>
                )}
                {!hasVoted && votingOpen && (
                  <VoteButton
                    loading={!!votingId && votingId === option.id}
                    onClick={() => castVote(option.id)}
                    disabled={!!votingId}
                  />
                )}
              </>
            }
            hideBar={!hasVoted || !votingOpen}
            className={'min-h-[40px]'}
          />
        )
      })}
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
