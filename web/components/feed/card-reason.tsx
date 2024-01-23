import clsx from 'clsx'
import { Contract } from 'common/contract'
import { HiSparkles } from 'react-icons/hi'
import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'
import dayjs from 'dayjs'
import { UserLink } from 'web/components/widgets/user-link'
import { BiRepost } from 'react-icons/bi'
import { Tooltip } from 'web/components/widgets/tooltip'

export function CardReason(props: {
  item: FeedTimelineItem | undefined
  contract: Contract
  probChange?: number
  since?: number
}) {
  const { item, contract, probChange, since } = props

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
      return <ProbabilityChange probChange={probChange} since={since} />
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
    return <div />
  }
  if (item.dataType === 'repost' && item.creatorDetails) {
    return (
      <Tooltip text={'Reposted by ' + item.creatorDetails.name}>
        <Row className={'text-ink-400 gap-1 text-sm'}>
          <BiRepost className={' text-ink-500 h-5 w-5'} />
          <UserLink short={true} user={item.creatorDetails} />
          reposted
          <RelativeTimestamp
            time={item.createdTime}
            shortened={true}
            className="text-ink-400 -ml-1"
          />
        </Row>
      </Tooltip>
    )
  }
  if (probChange) {
    return <ProbabilityChange probChange={probChange} since={since} />
  }

  if (item.dataType == 'new_contract') {
    const diff = dayjs(item.createdTime).diff(
      dayjs(contract.createdTime),
      'day'
    )

    return (
      <Row className={'text-ink-400 items-center gap-1 text-sm'}>
        <HiSparkles className={'h-4 w-4 text-yellow-400'} />
        <span>
          {diff >= 1 ? 'updated' : 'created'}
          <RelativeTimestamp
            time={item.createdTime}
            shortened={true}
            className="text-ink-400"
          />
        </span>
      </Row>
    )
  }
  return <div />
}

function ProbabilityChange(props: { probChange: number; since?: number }) {
  const { probChange, since } = props
  const positiveChange = probChange && probChange > 0
  return (
    <span
      className={clsx(
        'text-ink-500 my-auto items-center gap-1 text-sm',
        positiveChange ? 'text-teal-600' : 'text-scarlet-600'
      )}
    >
      <span className="font-bold">
        {positiveChange ? '+' : ''}
        {probChange}%
      </span>{' '}
      {since
        ? shortenedFromNow(since) === '1d'
          ? 'today'
          : shortenedFromNow(since)
        : 'today'}
    </span>
  )
}
