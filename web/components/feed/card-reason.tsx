import clsx from 'clsx'
import { Contract } from 'common/contract'
import { HOUR_MS } from 'common/util/time'
import { HiSparkles } from 'react-icons/hi'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { Tooltip } from '../widgets/tooltip'

export function CardReason(props: {
  item: FeedTimelineItem | undefined
  contract: Contract
  probChange: number | null
}) {
  const { item, contract, probChange } = props

  if (!item) {
    if (contract.resolutionTime) {
      return (
        <span className="text-ink-400 text-sm">
          resolved
          <RelativeTimestamp
            time={contract.resolutionTime}
            shortened={true}
            className="text-ink-400"
          />
        </span>
      )
    } else if (probChange) {
      return <ProbabilityChange probChange={probChange} />
    } else {
      return (
        <span className="text-ink-400 text-sm">
          created
          <RelativeTimestamp
            time={contract.createdTime}
            shortened={true}
            className="text-ink-400"
          />
        </span>
      )
    }
  }

  if (item.isCopied) {
    return <></>
  }

  if (probChange) {
    return <ProbabilityChange probChange={probChange} />
  }

  if (item.dataType == 'new_contract') {
    return (
      <Row className={'text-ink-400 items-center gap-1 text-sm'}>
        <HiSparkles className={'h-4 w-4 text-yellow-400'} />
        <span>
          created
          <RelativeTimestamp
            time={item.createdTime}
            shortened={true}
            className="text-ink-400"
          />
        </span>
      </Row>
    )
  }

  return (
    <>
      {item &&
        !item.isCopied &&
        (item.dataType === 'contract_probability_changed' ||
          item.dataType == 'trending_contract') && (
          <div className={'text-ink-400 text-sm'}>
            {item.dataType === 'contract_probability_changed' && (
              <RelativeTimestamp
                time={item.createdTime - 24 * HOUR_MS}
                shortened={true}
              />
            )}
            <Tooltip text={item?.reasonDescription} placement={'top'}>
              {item.dataType === 'contract_probability_changed'
                ? ' change'
                : item.dataType === 'trending_contract'
                ? ' trending'
                : item.dataType === 'new_subsidy'
                ? ' subsidized'
                : ''}
            </Tooltip>
            {item.dataType !== 'contract_probability_changed' && (
              <RelativeTimestamp time={item.createdTime} shortened={true} />
            )}
          </div>
        )}
    </>
  )
}

function ProbabilityChange(props: { probChange: number }) {
  const { probChange } = props
  const positiveChange = probChange && probChange > 0
  return (
    <span
      className={clsx(
        'text-ink-500 my-auto items-center gap-1 text-sm',
        positiveChange
          ? ' text-teal-600 dark:text-teal-300'
          : 'dark:text-scarlet-200 text-scarlet-600'
      )}
    >
      <span className="font-bold">
        {positiveChange ? '+' : ''}
        {probChange}%
      </span>{' '}
      today
    </span>
  )
}
