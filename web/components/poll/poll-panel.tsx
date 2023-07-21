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

export function PollPanel(props: { contract: PollContract }) {
  const { contract } = props
  const { options, closeTime } = contract
  const totalVotes = options.reduce((acc, option) => acc + option.votes, 0)
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

  const castVote = (voteId: string) => {
    if (!user) {
      firebaseLogin()
      return
    }
    castPollVote({ contractId: contract.id, voteId: voteId })
    setHasVoted(true)
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
                  <VoteButton onClick={() => castVote(option.id)} />
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

export function VoteButton(props: { onClick: () => void }) {
  const { onClick } = props
  return (
    <Button
      onClick={onClick}
      size="2xs"
      color="indigo-outline"
      className="!ring-1"
    >
      Vote
    </Button>
  )
}
