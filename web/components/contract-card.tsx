import clsx from 'clsx'
import Link from 'next/link'
import { Row } from '../components/layout/row'
import { formatMoney } from '../../common/util/format'
import { UserLink } from './user-page'
import {
  Contract,
  contractMetrics,
  contractPath,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import dayjs from 'dayjs'
import { TrendingUpIcon } from '@heroicons/react/solid'
import { DateTimeTooltip } from './datetime-tooltip'
import { ClockIcon } from '@heroicons/react/outline'
import { fromNow } from '../lib/util/time'
import { Avatar } from './avatar'
import { Spacer } from './layout/spacer'

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
  className?: string
}) {
  const { contract, showHotVolume, showCloseTime, className } = props
  const { question, resolution } = contract
  const { probPercent } = contractMetrics(contract)

  return (
    <div>
      <div
        className={clsx(
          'relative rounded-lg bg-white p-6 shadow-md hover:bg-gray-100',
          className
        )}
      >
        <Link href={contractPath(contract)}>
          <a className="absolute left-0 right-0 top-0 bottom-0" />
        </Link>

        <AbbrContractDetails
          contract={contract}
          showHotVolume={showHotVolume}
          showCloseTime={showCloseTime}
        />
        <Spacer h={3} />

        <Row className="justify-between gap-4">
          <p className="font-medium text-indigo-700">{question}</p>
          <ResolutionOrChance
            className="items-center"
            resolution={resolution}
            probPercent={probPercent}
          />
        </Row>
      </div>
    </div>
  )
}

export function ResolutionOrChance(props: {
  resolution?: 'YES' | 'NO' | 'MKT' | 'CANCEL'
  probPercent: string
  large?: boolean
  className?: string
}) {
  const { resolution, probPercent, large, className } = props

  const resolutionColor = {
    YES: 'text-primary',
    NO: 'text-red-400',
    MKT: 'text-blue-400',
    CANCEL: 'text-yellow-400',
    '': '', // Empty if unresolved
  }[resolution || '']

  const resolutionText = {
    YES: 'YES',
    NO: 'NO',
    MKT: probPercent,
    CANCEL: 'N/A',
    '': '',
  }[resolution || '']

  return (
    <Col className={clsx(large ? 'text-4xl' : 'text-3xl', className)}>
      {resolution ? (
        <>
          <div
            className={clsx('text-gray-500', large ? 'text-xl' : 'text-base')}
          >
            Resolved
          </div>
          <div className={resolutionColor}>{resolutionText}</div>
        </>
      ) : (
        <>
          <div className="text-primary">{probPercent}</div>
          <div
            className={clsx('text-primary', large ? 'text-xl' : 'text-base')}
          >
            chance
          </div>
        </>
      )}
    </Col>
  )
}

function AbbrContractDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
}) {
  const { contract, showHotVolume, showCloseTime } = props
  const { volume24Hours, creatorName, creatorUsername, closeTime } = contract
  const { truePool } = contractMetrics(contract)

  return (
    <Col className={clsx('gap-2 text-sm text-gray-500')}>
      <Row className="items-center justify-between">
        <Row className="items-center gap-2">
          <Avatar
            username={creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size={6}
          />
          <UserLink
            className="whitespace-nowrap"
            name={creatorName}
            username={creatorUsername}
          />
        </Row>

        {showHotVolume ? (
          <div className="whitespace-nowrap">
            <TrendingUpIcon className="inline h-5 w-5 text-gray-500" />{' '}
            {formatMoney(volume24Hours)}
          </div>
        ) : showCloseTime ? (
          <div className="whitespace-nowrap">
            <ClockIcon className="-my-1 inline h-5 w-5 text-gray-500" /> Closes{' '}
            {fromNow(closeTime || 0)}
          </div>
        ) : (
          <div className="whitespace-nowrap">{formatMoney(truePool)} pool</div>
        )}
      </Row>
    </Col>
  )
}

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props
  const { closeTime, creatorName, creatorUsername } = contract
  const { truePool, createdDate, resolvedDate } = contractMetrics(contract)

  return (
    <Col className="gap-2 text-sm text-gray-500 sm:flex-row sm:flex-wrap">
      <Row className="flex-wrap items-center gap-2">
        <Avatar
          username={creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size={6}
        />
        <UserLink
          className="whitespace-nowrap"
          name={creatorName}
          username={creatorUsername}
        />
        <div className="">•</div>

        <div className="whitespace-nowrap">
          <DateTimeTooltip text="Market created:" time={contract.createdTime}>
            {createdDate}
          </DateTimeTooltip>

          {resolvedDate && contract.resolutionTime ? (
            <>
              {' - '}
              <DateTimeTooltip
                text="Market resolved:"
                time={contract.resolutionTime}
              >
                {resolvedDate}
              </DateTimeTooltip>
            </>
          ) : null}

          {!resolvedDate && closeTime && (
            <>
              {' - '}
              <DateTimeTooltip
                text={
                  closeTime > Date.now() ? 'Trading ends:' : 'Trading ended:'
                }
                time={closeTime}
              >
                {dayjs(closeTime).format('MMM D, YYYY')}
              </DateTimeTooltip>
            </>
          )}
        </div>

        <div className="">•</div>
        <div className="whitespace-nowrap">{formatMoney(truePool)} pool</div>
      </Row>
    </Col>
  )
}

// String version of the above, to send to the OpenGraph image generator
export function contractTextDetails(contract: Contract) {
  const { closeTime, tags } = contract
  const { truePool, createdDate, resolvedDate } = contractMetrics(contract)

  const hashtags = tags.map((tag) => `#${tag}`)

  return (
    `${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
    (closeTime
      ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(
          closeTime
        ).format('MMM D, h:mma')}`
      : '') +
    ` • ${formatMoney(truePool)} pool` +
    (hashtags.length > 0 ? ` • ${hashtags.join(' ')}` : '')
  )
}
