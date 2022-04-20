import clsx from 'clsx'
import _ from 'lodash'
import { ClockIcon, DatabaseIcon, PencilIcon } from '@heroicons/react/outline'
import { TrendingUpIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import { formatMoney } from '../../../common/util/format'
import { UserLink } from '../user-page'
import {
  Contract,
  contractMetrics,
  updateContract,
} from '../../lib/firebase/contracts'
import { Col } from '../layout/col'
import dayjs from 'dayjs'
import { DateTimeTooltip } from '../datetime-tooltip'
import { fromNow } from '../../lib/util/time'
import { Avatar } from '../avatar'
import { useState } from 'react'
import { ContractInfoDialog } from './contract-info-dialog'
import { Bet } from '../../../common/bet'

export function AbbrContractDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
}) {
  const { contract, showHotVolume, showCloseTime } = props
  const { volume24Hours, creatorName, creatorUsername, closeTime } = contract
  const { volumeLabel } = contractMetrics(contract)

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
            {volumeLabel}
          </Row>
        )}
      </Row>
    </Col>
  )
}

export function ContractDetails(props: {
  contract: Contract
  bets: Bet[]
  isCreator?: boolean
  hideShareButtons?: boolean
}) {
  const { contract, bets, isCreator, hideShareButtons } = props
  const { closeTime, creatorName, creatorUsername } = contract
  const { volumeLabel, createdDate, resolvedDate } = contractMetrics(contract)

  return (
    <Col className="gap-2 text-sm text-gray-500 sm:flex-row sm:flex-wrap">
      <Row className="flex-1 flex-wrap items-center gap-x-4 gap-y-3">
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

        {(!!closeTime || !!resolvedDate) && (
          <Row className="items-center gap-1">
            <ClockIcon className="h-5 w-5" />

            {/* <DateTimeTooltip text="Market created:" time={contract.createdTime}>
            {createdDate}
          </DateTimeTooltip> */}

            {resolvedDate && contract.resolutionTime ? (
              <>
                {/* {' - '} */}
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
                {/* {' - '}{' '} */}
                <EditableCloseDate
                  closeTime={closeTime}
                  contract={contract}
                  isCreator={isCreator ?? false}
                />
              </>
            )}
          </Row>
        )}

        <Row className="items-center gap-1">
          <DatabaseIcon className="h-5 w-5" />

          <div className="whitespace-nowrap">{volumeLabel}</div>
        </Row>

        {!hideShareButtons && (
          <ContractInfoDialog contract={contract} bets={bets} />
        )}
      </Row>
    </Col>
  )
}

// String version of the above, to send to the OpenGraph image generator
export function contractTextDetails(contract: Contract) {
  const { closeTime, tags } = contract
  const { createdDate, resolvedDate, volumeLabel } = contractMetrics(contract)

  const hashtags = tags.map((tag) => `#${tag}`)

  return (
    `${resolvedDate ? `${createdDate} - ${resolvedDate}` : createdDate}` +
    (closeTime
      ? ` • ${closeTime > Date.now() ? 'Closes' : 'Closed'} ${dayjs(
          closeTime
        ).format('MMM D, h:mma')}`
      : '') +
    ` • ${volumeLabel}` +
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

  const isSameYear = dayjs(closeTime).isSame(dayjs(), 'year')
  const isSameDay = dayjs(closeTime).isSame(dayjs(), 'day')

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
          {isSameYear
            ? dayjs(closeTime).format('MMM D')
            : dayjs(closeTime).format('MMM D, YYYY')}
          {isSameDay && <> ({fromNow(closeTime)})</>}
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
