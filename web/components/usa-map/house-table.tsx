import { Answer, MultiSort, sortAnswers } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { useMemo, useState } from 'react'
import { Row } from '../layout/row'
import { house2024 } from 'web/public/data/house-data'

export function HouseTable(props: { liveHouseContract: MultiContract }) {
  const { liveHouseContract } = props
  const [sort, setSort] = useState<MultiSort>('prob-desc')

  const isMultipleChoice = liveHouseContract.outcomeType === 'MULTIPLE_CHOICE'
  const answers = liveHouseContract.answers
    .filter((a) => isMultipleChoice || ('number' in a && a.number !== 0))
    .map((a) => ({
      ...a,
      prob: getAnswerProbability(liveHouseContract, a.id),
    }))

  const sortedAnswers = useMemo(
    () => sortAnswers(liveHouseContract, answers, sort),
    [answers, sort]
  )
  return (
    <>
      {sortedAnswers.map((answer) => {
        return <HouseRow key={answer.text} houseAnswer={answer} />
      })}
    </>
  )
}

function HouseRow(props: { houseAnswer: Answer }) {
  const { houseAnswer } = props
  const { state, number } = extractDistrictInfo(houseAnswer.text)
  const houseData = house2024[houseAnswer.text.replace(/\s+/g, ' ')]

  console.log(houseAnswer.text)

  return (
    <Row>
      <div className="w-8">{state}</div>
      <div className="w-8">{number}</div>

      <div className="w-24">
        {houseData?.incumbentShort ?? houseData?.status ?? ''}
      </div>
    </Row>
  )
}

interface DistrictInfo {
  state: string
  number: string
}

function extractDistrictInfo(input: string): DistrictInfo {
  const regex = /^(?<state>[A-Z]{2})-(?<number>\d{2})/
  const match = input.match(regex)

  if (!match || !match.groups) {
    throw new Error('Invalid input format')
  }

  const { state, number } = match.groups
  return {
    state,
    number,
  }
}
