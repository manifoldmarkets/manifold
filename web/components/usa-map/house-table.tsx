import { Answer, MultiSort, sortAnswers } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract, MultiContract } from 'common/contract'
import { useMemo, useState } from 'react'
import { Row } from '../layout/row'
import { house2024 } from 'web/public/data/house-data'
import { AnswerStatus } from '../answers/answer-components'
import { HouseStatus, houseProbToColor } from './house-table-helpers'
import { DATA } from './usa-map-data'
import { ChevronDownIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { BiCaretDown, BiCaretUp } from 'react-icons/bi'
import { Col } from '../layout/col'

export function HouseTable(props: { liveHouseContract: CPMMMultiContract }) {
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
      <Row className="text-ink-500 mb-1 w-full justify-between text-sm">
        <Row>
          <button
            className="group flex w-[88px] flex-row items-center sm:w-40"
            onClick={() => {
              if (sort == 'alphabetical') {
                setSort('prob-asc')
              } else {
                setSort('alphabetical')
              }
            }}
          >
            District{' '}
            <BiCaretDown
              className={clsx(
                ' text-ink-300 h-4 w-4 transition-colors',
                sort == 'alphabetical'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500'
              )}
            />
          </button>
          <div>Incumbent</div>
        </Row>
        <button
          className="sm:w-22 group flex w-[121px]  flex-row items-center sm:hidden sm:justify-end"
          onClick={() => {
            if (sort == 'prob-desc') {
              setSort('prob-asc')
            } else {
              setSort('prob-desc')
            }
          }}
        >
          Odds{' '}
          <div className="relative">
            <BiCaretUp
              className={clsx(
                ' absolute -top-[6px] h-4 w-4 transition-colors',
                sort == 'prob-asc'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500 text-ink-200 dark:text-ink-300'
              )}
            />
            <BiCaretDown
              className={clsx(
                ' -mb-[2px] h-4 w-4 transition-colors',
                sort == 'prob-desc'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500 text-ink-200 dark:text-ink-300'
              )}
            />
          </div>
        </button>
        <Row className="hidden gap-4 sm:flex">
          <button
            className="group flex w-24 flex-row items-center"
            onClick={() => {
              if (sort == 'prob-asc') {
                setSort('prob-desc')
              } else {
                setSort('prob-asc')
              }
            }}
          >
            Democratic{' '}
            <BiCaretDown
              className={clsx(
                ' h-4 w-4 transition-colors',
                sort == 'prob-asc'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500 text-ink-200 dark:text-ink-300'
              )}
            />
          </button>
          <button
            className="w-22 group flex flex-row items-center justify-end"
            onClick={() => {
              if (sort == 'prob-desc') {
                setSort('prob-asc')
              } else {
                setSort('prob-desc')
              }
            }}
          >
            Republican{' '}
            <BiCaretDown
              className={clsx(
                ' h-4 w-4 transition-colors',
                sort == 'prob-desc'
                  ? 'text-ink-500'
                  : 'group-hover:text-ink-500 text-ink-200 dark:text-ink-300'
              )}
            />
          </button>
        </Row>
      </Row>
      {sortedAnswers.map((answer) => {
        return (
          <HouseRow
            key={answer.text}
            houseAnswer={answer as Answer}
            contract={liveHouseContract}
          />
        )
      })}
    </>
  )
}

function HouseRow(props: { houseAnswer: Answer; contract: CPMMMultiContract }) {
  const { houseAnswer, contract } = props
  const { state, number } = extractDistrictInfo(houseAnswer.text)
  const fullState = DATA[state].name
  const houseData = house2024[houseAnswer.text.replace(/\s+/g, ' ')]

  return (
    <Row className="border-ink-300 justify-between border-b">
      <Row className="items-center">
        <div
          className=" mr-2 h-full w-4 transition-colors sm:h-8"
          style={{
            background: houseProbToColor(houseAnswer.prob),
          }}
        />
        <div className="hidden w-32 sm:flex">{fullState}</div>
        <div className=" w-8 sm:hidden">{state}</div>
        <div className="w-8">{number}</div>

        <div className="w-40">
          {houseData?.status == 'OPEN' ? (
            <span>
              OPEN
              {houseData?.incumbentShort ? (
                <span className="text-ink-600">
                  {' '}
                  ({houseData.incumbentShort})
                </span>
              ) : (
                <></>
              )}
            </span>
          ) : (
            houseData?.incumbentShort ?? houseData?.status ?? ''
          )}
        </div>
      </Row>
      <HouseStatus contract={contract} answer={houseAnswer} />
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
