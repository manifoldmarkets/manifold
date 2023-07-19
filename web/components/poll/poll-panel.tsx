import { PollContract } from 'common/contract'
import { Col } from '../layout/col'
import { AnswerBar } from '../answers/answer-item'
import { PollOption } from 'common/poll-option'

export function PollPanel(props: { contract: PollContract }) {
  const { options } = props.contract
  const totalVotes = options.reduce((acc, option) => acc + option.votes, 0)
  return (
    <Col>
      {options.map((option: PollOption) => {
        const prob = option.votes / totalVotes

        return (
          <AnswerBar
            color={'#F9FAFB'}
            prob={prob}
            resolvedProb={undefined}
            label={<div>{option.text}</div>}
            end={
              <>
                <div>{option.votes}</div>
              </>
            }
          />
        )
      })}
    </Col>
  )
}
