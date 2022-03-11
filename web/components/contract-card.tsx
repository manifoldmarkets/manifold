import clsx from 'clsx'
import Link from 'next/link'
import { ClockIcon, DatabaseIcon, PencilIcon } from '@heroicons/react/outline'
import { TrendingUpIcon } from '@heroicons/react/solid'
import { Row } from '../components/layout/row'
import { formatMoney } from '../../common/util/format'
import { UserLink } from './user-page'
import {
  Contract,
  contractMetrics,
  contractPath,
  getBinaryProbPercent,
  updateContract,
} from '../lib/firebase/contracts'
import { Col } from './layout/col'
import dayjs from 'dayjs'
import { DateTimeTooltip } from './datetime-tooltip'
import { fromNow } from '../lib/util/time'
import { Avatar } from './avatar'
import { Spacer } from './layout/spacer'
import { useState } from 'react'
import { TweetButton } from './tweet-button'

export function ContractCard(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
  className?: string
}) {
  const { contract, showHotVolume, showCloseTime, className } = props
  const { question } = contract

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
          <p
            className="break-words font-medium text-indigo-700"
            style={{ /* For iOS safari */ wordBreak: 'break-word' }}
          >
            {question}
          </p>
          <ResolutionOrChance className="items-center" contract={contract} />
        </Row>
      </div>
    </div>
  )
}

export function ResolutionOrChance(props: {
  contract: Contract
  large?: boolean
  className?: string
}) {
  const { contract, large, className } = props
  const { resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'
  const marketClosed = (contract.closeTime || Infinity) < Date.now()

  const resolutionColor =
    {
      YES: 'text-primary',
      NO: 'text-red-400',
      MKT: 'text-blue-400',
      CANCEL: 'text-yellow-400',
      '': '', // Empty if unresolved
    }[resolution || ''] ?? 'text-primary'

  const probColor = marketClosed ? 'text-gray-400' : 'text-primary'

  const resolutionText =
    {
      YES: 'YES',
      NO: 'NO',
      MKT: isBinary ? getBinaryProbPercent(contract) : 'MULTI',
      CANCEL: 'N/A',
      '': '',
    }[resolution || ''] ?? `#${resolution}`

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
        isBinary && (
          <>
            <div className={probColor}>{getBinaryProbPercent(contract)}</div>
            <div className={clsx(probColor, large ? 'text-xl' : 'text-base')}>
              chance
            </div>
          </>
        )
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
  const { liquidityLabel } = contractMetrics(contract)

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
          <Row className="gap-1">
            <TrendingUpIcon className="h-5 w-5" /> {formatMoney(volume24Hours)}
          </Row>
        ) : showCloseTime ? (
          <Row className="gap-1">
            <ClockIcon className="h-5 w-5" />
            {(closeTime || 0) < Date.now() ? 'Closed' : 'Closes'}{' '}
            {fromNow(closeTime || 0)}
          </Row>
        ) : (
          <Row className="gap-1">
            {/* <DatabaseIcon className="h-5 w-5" /> */}
            {liquidityLabel}
          </Row>
        )}
      </Row>
    </Col>
  )
}

export function ContractDetails(props: {
  contract: Contract
  isCreator?: boolean
}) {
  const { contract, isCreator } = props
  const { closeTime, creatorName, creatorUsername } = contract
  const { liquidityLabel, createdDate, resolvedDate } =
    contractMetrics(contract)

  const tweetText = getTweetText(contract, !!isCreator)

  return (
    <Col className="gap-2 text-sm text-gray-500 sm:flex-row sm:flex-wrap">
      <Row className="flex-wrap items-center gap-x-4 gap-y-2">
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

        <Row className="items-center gap-1">
          <ClockIcon className="h-5 w-5" />

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
              {' - '}{' '}
              <EditableCloseDate
                closeTime={closeTime}
                contract={contract}
                isCreator={isCreator ?? false}
              />
            </>
          )}
        </Row>

        <Row className="items-center gap-1">
          <DatabaseIcon className="h-5 w-5" />

          <div className="whitespace-nowrap">{liquidityLabel}</div>
        </Row>

        <TweetButton className={'self-end'} tweetText={tweetText} />
      </Row>
    </Col>
  )
}

// String version of the above, to send to the OpenGraph image generator
export function contractTextDetails(contract: Contract) {
  const { closeTime, tags } = contract
  const { createdDate, resolvedDate, liquidityLabel } =
    contractMetrics(contract)

  const hashtags = tags.map((tag) => `#${tag}`)

  return (
    `${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
    (closeTime
      ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(
          closeTime
        ).format('MMM D, h:mma')}`
      : '') +
    ` • ${liquidityLabel}` +
    (hashtags.length > 0 ? ` • ${hashtags.join(' ')}` : '')
  )
}

function EditableCloseDate(props: {
  closeTime: number
  contract: Contract
  isCreator: boolean
}) {
  const { closeTime, contract, isCreator } = props

  const [isEditingCloseTime, setIsEditingCloseTime] = useState(false)
  const [closeDate, setCloseDate] = useState(
    closeTime && dayjs(closeTime).format('YYYY-MM-DDT23:59')
  )

  const onSave = () => {
    const newCloseTime = dayjs(closeDate).valueOf()
    if (newCloseTime === closeTime) setIsEditingCloseTime(false)
    else if (newCloseTime > Date.now()) {
      const { description } = contract
      const formattedCloseDate = dayjs(newCloseTime).format('YYYY-MM-DD h:mm a')
      const newDescription = `${description}\n\nClose date updated to ${formattedCloseDate}`

      updateContract(contract.id, {
        closeTime: newCloseTime,
        description: newDescription,
      })

      setIsEditingCloseTime(false)
    }
  }

  return (
    <>
      {isEditingCloseTime ? (
        <div className="form-control mr-1 items-start">
          <input
            type="datetime-local"
            className="input input-bordered"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseDate(e.target.value || '')}
            min={Date.now()}
            value={closeDate}
          />
        </div>
      ) : (
        <DateTimeTooltip
          text={closeTime > Date.now() ? 'Trading ends:' : 'Trading ended:'}
          time={closeTime}
        >
          {dayjs(closeTime).format('MMM D')} ({fromNow(closeTime)})
        </DateTimeTooltip>
      )}

      {isCreator &&
        (isEditingCloseTime ? (
          <button className="btn btn-xs" onClick={onSave}>
            Done
          </button>
        ) : (
          <button
            className="btn btn-xs btn-ghost"
            onClick={() => setIsEditingCloseTime(true)}
          >
            <PencilIcon className="mr-2 inline h-4 w-4" /> Edit
          </button>
        ))}
    </>
  )
}

const getTweetText = (contract: Contract, isCreator: boolean) => {
  const { question, creatorName, resolution, outcomeType } = contract
  const isBinary = outcomeType === 'BINARY'

  const tweetQuestion = isCreator
    ? question
    : `${question} Asked by ${creatorName}.`
  const tweetDescription = resolution
    ? `Resolved ${resolution}!`
    : isBinary
    ? `Currently ${getBinaryProbPercent(
        contract
      )} chance, place your bets here:`
    : `Submit your own answer:`

  const timeParam = `${Date.now()}`.substring(7)
  const url = `https://manifold.markets${contractPath(contract)}?t=${timeParam}`

  return `${tweetQuestion}\n\n${tweetDescription}\n\n${url}`
}
