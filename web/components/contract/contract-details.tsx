import clsx from 'clsx'
import {
  ClockIcon,
  DatabaseIcon,
  PencilIcon,
  CurrencyDollarIcon,
  TrendingUpIcon,
  StarIcon,
} from '@heroicons/react/outline'
import { StarIcon as SolidStarIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { UserLink } from '../user-page'
import {
  Contract,
  contractMetrics,
  contractPool,
  updateContract,
} from 'web/lib/firebase/contracts'
import { Col } from '../layout/col'
import dayjs from 'dayjs'
import { DateTimeTooltip } from '../datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../avatar'
import { useState } from 'react'
import { ContractInfoDialog } from './contract-info-dialog'
import { Bet } from 'common/bet'
import NewContractBadge from '../new-contract-badge'
import { CATEGORY_LIST } from 'common/categories'
import { TagsList } from '../tags-list'

export function MiscDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
}) {
  const { contract, showHotVolume, showCloseTime } = props
  const { volume, volume24Hours, closeTime, tags } = contract
  const { volumeLabel } = contractMetrics(contract)
  // Show at most one category that this contract is tagged by
  const categories = CATEGORY_LIST.filter((category) =>
    tags.map((t) => t.toLowerCase()).includes(category)
  ).slice(0, 1)

  return (
    <Row className="items-center gap-3 text-sm text-gray-400">
      {showHotVolume ? (
        <Row className="gap-0.5">
          <TrendingUpIcon className="h-5 w-5" /> {formatMoney(volume24Hours)}
        </Row>
      ) : showCloseTime ? (
        <Row className="gap-0.5">
          <ClockIcon className="h-5 w-5" />
          {(closeTime || 0) < Date.now() ? 'Closed' : 'Closes'}{' '}
          {fromNow(closeTime || 0)}
        </Row>
      ) : volume > 0 ? (
        <Row>{contractPool(contract)} pool</Row>
      ) : (
        <NewContractBadge />
      )}

      {categories.length > 0 && (
        <TagsList className="text-gray-400" tags={categories} noLabel />
      )}
    </Row>
  )
}

export function AvatarDetails(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername } = contract

  return (
    <Row className="items-center gap-2 text-sm text-gray-400">
      <Avatar
        username={creatorUsername}
        avatarUrl={contract.creatorAvatarUrl}
        size={6}
      />
      <UserLink name={creatorName} username={creatorUsername} />
    </Row>
  )
}

export function AbbrContractDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showCloseTime?: boolean
}) {
  const { contract, showHotVolume, showCloseTime } = props
  return (
    <Row className="items-center justify-between">
      <AvatarDetails contract={contract} />

      <MiscDetails
        contract={contract}
        showHotVolume={showHotVolume}
        showCloseTime={showCloseTime}
      />
    </Row>
  )
}

export function ContractDetails(props: {
  contract: Contract
  bets: Bet[]
  isCreator?: boolean
  disabled?: boolean
}) {
  const { contract, bets, isCreator, disabled } = props
  const { closeTime, creatorName, creatorUsername } = contract
  const { volumeLabel, automaticResolutionDate, resolvedDate } = contractMetrics(contract)

  return (
    <Row className="flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
      <Row className="items-center gap-2">
        <Avatar
          username={creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          noLink={disabled}
          size={6}
        />
        {disabled ? (
          creatorName
        ) : (
          <UserLink
            className="whitespace-nowrap"
            name={creatorName}
            username={creatorUsername}
          />
        )}
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

      {!resolvedDate && contract.automaticResolutionTime && (
        <DateTimeTooltip
        text="Market automatically resolving:"
        time={contract.automaticResolutionTime}
      >
        {automaticResolutionDate + ": " + contract.automaticResolution}
      </DateTimeTooltip>
      )}

      <Row className="items-center gap-1">
        <DatabaseIcon className="h-5 w-5" />

        <div className="whitespace-nowrap">{volumeLabel}</div>
      </Row>

      {!disabled && <ContractInfoDialog contract={contract} bets={bets} />}
    </Row>
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
