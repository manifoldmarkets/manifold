import { DATA } from './usa-map-data'
import { Row } from 'web/components/layout/row'
import { ALSO_DEMOCRATIC, probToColor } from './state-election-map'
import { Col } from 'web/components/layout/col'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { HIGHLIGHTED_OUTLINE_COLOR, SELECTED_OUTLINE_COLOR } from './usa-map'
import clsx from 'clsx'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import {
  MapContractsDictionary,
  StateElectionMarket,
} from 'web/public/data/elections-data'
import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { BinaryContract } from 'common/contract'
import Image from 'next/image'
export function ElectoralCollegeVisual(props: {
  sortedContractsDictionary: MapContractsDictionary
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | null | undefined
  hoveredState: string | null | undefined
}) {
  const {
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
    sortedContractsDictionary,
  } = props

  const isMobile = useIsMobile()
  return (
    <Col className="mt-2 w-full text-xs sm:text-base">
      <Row className="w-full justify-between">
        <Row className="gap-2">
          <Image
            src="/political-candidates/harris.png"
            height={60}
            width={60}
          />
          <Col className="mt-2">
            <div className="text-ink-700">Harris</div>
            <div>
              X Electoral Votes{' '}
              <span className="text-ink-500">(+Y likely)</span>
            </div>
          </Col>
        </Row>
        <Row className="gap-2">
          <Col className="mt-2 text-right">
            <div className="text-ink-700">Trump</div>
            <div>
              X Electoral Votes{' '}
              <span className="text-ink-500">(+Y likely)</span>
            </div>
          </Col>
          <Image src="/political-candidates/trump.png" height={60} width={60} />
        </Row>
      </Row>
      <Row className="overflow-none relative gap-[1px] rounded sm:gap-0.5">
        {Object.entries(sortedContractsDictionary).map(
          ([stateKey, contract], index) => {
            const fill = probToColor(contract) ?? ''
            const isHovered = hoveredState === stateKey
            const selected = targetState === stateKey
            return (
              <div
                key={contract!.id}
                className="relative h-5 transition-all"
                style={{
                  backgroundColor: fill,
                  width: `${(DATA[stateKey].electoralVotes / 538) * 100}%`,
                  outline:
                    isHovered || selected
                      ? `${isMobile ? '1px' : '2px'} solid ${
                          selected
                            ? SELECTED_OUTLINE_COLOR
                            : HIGHLIGHTED_OUTLINE_COLOR
                        }`
                      : 'none',
                }}
                onClick={() => handleClick(stateKey)}
                onMouseEnter={() => onMouseEnter(stateKey)}
                onMouseLeave={onMouseLeave}
              >
                {(isHovered || (selected && !hoveredState)) && (
                  <Row
                    className={clsx(
                      '0 text-ink-700 absolute top-6 z-20 gap-1 rounded py-1 transition-all',
                      index < 5
                        ? 'left-0'
                        : index > 45
                        ? 'right-0'
                        : '-left-[2rem]'
                    )}
                  >
                    <div className="whitespace-nowrap font-semibold">
                      {DATA[stateKey].abbreviation},
                    </div>
                    <div className="whitespace-nowrap">
                      {DATA[stateKey].electoralVotes} votes
                    </div>
                  </Row>
                )}
              </div>
            )
          }
        )}
      </Row>
      <Col className="text-ink-700 mx-auto items-center">
        <div className="-mb-1">270 to win</div>
        <ChevronUpIcon className="h-5 w-5" />
      </Col>
    </Col>
  )
}

export function sortByProbability(
  unsortedContractsDictionary: MapContractsDictionary
): MapContractsDictionary {
  return Object.entries(unsortedContractsDictionary)
    .map(([state, contract]) => ({
      state,
      contract,
      probability: contract
        ? getDisplayProbability(contract as BinaryContract)
        : 0,
    }))
    .sort((a, b) => b.probability - a.probability)
    .reduce((sortedData, data) => {
      sortedData[data.state] = data.contract
      return sortedData
    }, {} as MapContractsDictionary)
}

export function sortByDemocraticDiff(
  unsortedContractsDictionary: MapContractsDictionary,
  data?: StateElectionMarket[]
): MapContractsDictionary {
  return Object.entries(unsortedContractsDictionary)
    .map(([state, contract]) => {
      let diff = 0

      if (contract?.mechanism === 'cpmm-multi-1') {
        // ... existing CPMM multi logic ...
        const democraticAnswer = contract.answers.find(
          (answer) =>
            answer.text === 'Democratic Party' ||
            answer.text.includes('Democratic Party')
        )

        const democraticIndependentAnswerProb =
          contract.answers.find((answer) =>
            ALSO_DEMOCRATIC.includes(answer.text)
          )?.prob ?? 0

        diff = democraticAnswer
          ? getAnswerProbability(contract, democraticAnswer.id) +
            democraticIndependentAnswerProb
          : 0

        const x = data?.find((d) => d.state === state)
        if (x?.otherParty == 'Democratic Party') {
          const other = contract.answers.find((a) => a.isOther)?.id
          if (other) diff += getAnswerProbability(contract, other)
        }
      } else if (contract?.mechanism === 'cpmm-1') {
        // Binary contract logic
        const republicanProb = getDisplayProbability(contract as BinaryContract)
        diff = 1 - (republicanProb ?? 0)
      }

      return { state, contract, diff }
    })
    .sort((a, b) => b.diff - a.diff)
    .reduce((sortedData, data) => {
      sortedData[data.state] = data.contract
      return sortedData
    }, {} as MapContractsDictionary)
}
