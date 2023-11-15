import { sortBy } from 'lodash'
import { useEffect, useState } from 'react'

import { UserIcon } from '@heroicons/react/solid'
import { Answer } from 'common/answer'
import { CPMMMultiContract } from 'common/contract'
import { Lover } from 'common/love/lover'
import { getCPMMContractUserContractMetrics } from 'common/supabase/contract-metrics'
import { capitalize } from 'lodash'
import { calculateAge } from 'love/components/calculate-age'
import { Gender, convertGender } from 'love/components/gender-icon'
import OnlineIcon from 'love/components/online-icon'
import { getCumulativeRelationshipProb } from 'love/lib/util/relationship-market'
import Image from 'next/image'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useUser } from 'web/hooks/use-user'
import { db } from 'web/lib/supabase/db'
import { Button } from 'web/components/buttons/button'
import clsx from 'clsx'
import { AiOutlineCaretDown } from 'react-icons/ai'

const relationshipStages = [
  '1st date',
  '2nd date',
  '3rd date',
  '6-month relationship',
]

export const MatchTile = (props: {
  contract: CPMMMultiContract
  answers: Answer[]
  lover: Lover
  isYourMatch: boolean
}) => {
  const { lover, isYourMatch } = props
  const contract = (useFirebasePublicContract(
    props.contract.visibility,
    props.contract.id
  ) ?? props.contract) as CPMMMultiContract
  const fetchedAnswers = useAnswersCpmm(contract.id)
  const answers = fetchedAnswers ?? props.answers

  const { user, pinned_url } = lover
  const currentUser = useUser()

  const lastResolved = answers.reduce((acc, answer, index) => {
    return answer.resolution !== undefined ? index : acc
  }, -1)

  const [timeFrame, setTimeFrame] = useState(lastResolved + 1)
  //   const showConfirmStage =
  //     !answer.resolution && (!prevAnswer || prevAnswer.resolution === 'YES')

  //   const conditionProb =
  //     answer.index && getCumulativeRelationshipProb(contract, answer.index - 1)

  //   const [positions, setPositions] = usePersistentInMemoryState<
  //     undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  //   >(undefined, 'market-card-feed-positions-' + contract.id)
  //   useEffect(() => {
  //     getCPMMContractUserContractMetrics(contract.id, 10, answer.id, db).then(
  //       (positions) => {
  //         const yesPositions = sortBy(
  //           positions.YES.filter(
  //             (metric) => metric.userUsername !== 'ManifoldLove'
  //           ),
  //           (metric) => metric.invested
  //         ).reverse()
  //         const noPositions = sortBy(
  //           positions.NO.filter(
  //             (metric) => metric.userUsername !== 'ManifoldLove'
  //           ),
  //           (metric) => metric.invested
  //         ).reverse()
  //         setPositions({ YES: yesPositions, NO: noPositions })
  //       }
  //     )
  //   }, [contract.id, answer.id])
  return (
    <Col className="relative h-60  overflow-hidden rounded text-white transition-all  hover:drop-shadow">
      {pinned_url ? (
        <Image
          src={pinned_url}
          // You must set these so we don't pay an extra $1k/month to vercel
          width={180}
          height={240}
          alt={`${user.username}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <Col className="bg-ink-300 h-full w-full items-center justify-center">
          <UserIcon className="h-20 w-20" />
        </Col>
      )}

      <Col className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/70 to-transparent px-4 py-4 ">
        <Col className="-mb-[6px] rounded bg-white px-4 py-2 text-xs text-black opacity-70">
          <span>
            chance of{' '}
            <span className="text-sm font-semibold">
              {relationshipStages[timeFrame]}
            </span>
          </span>
        </Col>
        <Row className="text-xs">
          {Array(4)
            .fill(null)
            .map((_, i) => (
              <>
                {i !== 0 && (
                  <div
                    className={clsx(
                      '-mx-2 mt-[28px] flex h-0.5 flex-grow opacity-50',
                      answers[i].resolution ? 'bg-green-500' : 'bg-ink-300'
                    )}
                  />
                )}
                <Col className="items-center gap-1">
                  <AiOutlineCaretDown
                    key={i}
                    className={clsx(
                      'h-5 w-5 text-white opacity-70',
                      i !== timeFrame ? 'invisible' : ''
                    )}
                  />
                  <button
                    key={i}
                    onClick={() => setTimeFrame(i)}
                    className={clsx(
                      'z-10 h-3 w-3 rounded-full transition-all',

                      answers[i].resolution ? 'bg-green-500' : 'bg-ink-300',
                      timeFrame == i
                        ? `${
                            answers[i].resolution
                              ? 'ring-green-500'
                              : 'ring-ink-300'
                          } ring-4 ring-opacity-50`
                        : ''
                    )}
                  />
                </Col>
              </>
            ))}
        </Row>
      </Col>
    </Col>
  )
}
