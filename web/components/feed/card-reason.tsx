import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { RelativeTimestamp } from '../relative-timestamp'
import { Tooltip } from '../widgets/tooltip'
import { HOUR_MS } from 'common/util/time'

export function CardReason(props: { item: FeedTimelineItem | undefined }) {
  const { item } = props
  return (
    <>
      {item &&
        !item.isCopied &&
        (item.dataType === 'contract_probability_changed' ||
          item.dataType === 'trending_contract') && (
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
