import { PollContract } from 'common/contract'
import { Col } from '../layout/col'
import { AnswerBar } from '../answers/answer-item'

export function PollPanel(props: { contract: PollContract }) {
  return (
    <Col>
      <AnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        label={
          <AnswerLabel
            text={answer.text}
            creator={isFreeResponse ? answerCreator ?? false : undefined}
            className={clsx(
              'items-center text-sm !leading-none sm:flex sm:text-base',
              resolvedProb === 0 ? 'text-ink-600' : 'text-ink-900'
            )}
          />
        }
        end={
          <>
            {!tradingAllowed(contract) ? (
              <ClosedProb prob={prob} resolvedProb={resolvedProb} />
            ) : (
              <>
                <OpenProb prob={prob} />
                {isDpm ? (
                  <DPMMultiBettor answer={answer as any} contract={contract} />
                ) : (
                  <MultiBettor
                    answer={answer as any}
                    contract={contract as any}
                  />
                )}
              </>
            )}
            {onAnswerCommentClick && isFreeResponse && (
              <AddComment onClick={() => onAnswerCommentClick(answer)} />
            )}
          </>
        }
        bottom={
          hasBets &&
          isCpmm && <AnswerPosition contract={contract} userBets={userBets} />
        }
      />
    </Col>
  )
}
