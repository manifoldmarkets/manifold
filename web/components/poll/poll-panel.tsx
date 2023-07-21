import { PollContract } from 'common/contract'
import { Col } from '../layout/col'
import { AnswerBar } from '../answers/answer-item'
import { PollOption } from 'common/poll-option'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'
import { castPollVote } from 'web/lib/firebase/api'
import { useEffect, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { getHasVoted } from 'web/lib/supabase/polls'

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
            color={'#6366f1'}
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
                {!hasVoted && (
                  <VoteButton
                    contractId={contract.id}
                    voteId={option.id}
                    onClick={() => castVote(option.id)}
                  />
                )}
              </>
            }
            hideBar={!hasVoted}
          />
        )
      })}
    </Col>
  )
}

export function VoteButton(props: { onClick: () => void }) {
  const { onClick } = props
  return (
    <Button onClick={onClick} size="2xs">
      Vote
    </Button>
  )
}
