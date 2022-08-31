import {
  ClockIcon,
  DatabaseIcon,
  PencilIcon,
  TrendingUpIcon,
  UserGroupIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import dayjs from 'dayjs'

import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../avatar'
import { useState } from 'react'
import { ContractInfoDialog } from './contract-info-dialog'
import NewContractBadge from '../new-contract-badge'
import { UserFollowButton } from '../follow-button'
import { DAY_MS } from 'common/util/time'
import { useUser } from 'web/hooks/use-user'
import { exhibitExts } from 'common/util/parse'
import { Button } from 'web/components/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { SiteLink } from 'web/components/site-link'
import { groupPath } from 'web/lib/firebase/groups'
import { insertContent } from '../editor/utils'
import { contractMetrics } from 'common/contract-details'
import { User } from 'common/user'
import { UserLink } from 'web/components/user-link'
import { FeaturedContractBadge } from 'web/components/contract/featured-contract-badge'
import { Tooltip } from 'web/components/tooltip'
import { useWindowSize } from 'web/hooks/use-window-size'

export type ShowTime = 'resolve-date' | 'close-date'

export function MiscDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showTime?: ShowTime
  hideGroupLink?: boolean
}) {
  const { contract, showHotVolume, showTime, hideGroupLink } = props
  const {
    volume,
    volume24Hours,
    closeTime,
    isResolved,
    createdTime,
    resolutionTime,
    groupLinks,
  } = contract

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved

  return (
    <Row className="items-center gap-3 truncate text-sm text-gray-400">
      {showHotVolume ? (
        <Row className="gap-0.5">
          <TrendingUpIcon className="h-5 w-5" /> {formatMoney(volume24Hours)}
        </Row>
      ) : showTime === 'close-date' ? (
        <Row className="gap-0.5 whitespace-nowrap">
          <ClockIcon className="h-5 w-5" />
          {(closeTime || 0) < Date.now() ? 'Closed' : 'Closes'}{' '}
          {fromNow(closeTime || 0)}
        </Row>
      ) : showTime === 'resolve-date' && resolutionTime !== undefined ? (
        <Row className="gap-0.5">
          <ClockIcon className="h-5 w-5" />
          {'Resolved '}
          {fromNow(resolutionTime || 0)}
        </Row>
      ) : (contract?.featuredOnHomeRank ?? 0) > 0 ? (
        <FeaturedContractBadge />
      ) : volume > 0 || !isNew ? (
        <Row className={'shrink-0'}>{formatMoney(volume)} bet</Row>
      ) : (
        <NewContractBadge />
      )}

      {!hideGroupLink && groupLinks && groupLinks.length > 0 && (
        <SiteLink
          href={groupPath(groupLinks[0].slug)}
          className="truncate text-sm text-gray-400"
        >
          {groupLinks[0].name}
        </SiteLink>
      )}
    </Row>
  )
}

export function AvatarDetails(props: {
  contract: Contract
  className?: string
  short?: boolean
}) {
  const { contract, short, className } = props
  const { creatorName, creatorUsername, creatorAvatarUrl } = contract

  return (
    <Row
      className={clsx('items-center gap-2 text-sm text-gray-400', className)}
    >
      <Avatar
        username={creatorUsername}
        avatarUrl={creatorAvatarUrl}
        size={6}
      />
      <UserLink name={creatorName} username={creatorUsername} short={short} />
    </Row>
  )
}

export function AbbrContractDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showTime?: ShowTime
}) {
  const { contract, showHotVolume, showTime } = props
  return (
    <Row className="items-center justify-between">
      <AvatarDetails contract={contract} />

      <MiscDetails
        contract={contract}
        showHotVolume={showHotVolume}
        showTime={showTime}
      />
    </Row>
  )
}

export function ContractDetails(props: {
  contract: Contract
  user: User | null | undefined
  isCreator?: boolean
  disabled?: boolean
}) {
  const { contract, isCreator, disabled } = props
  const {
    closeTime,
    creatorName,
    creatorUsername,
    creatorId,
    groupLinks,
    creatorAvatarUrl,
    resolutionTime,
  } = contract
  const { volumeLabel, resolvedDate } = contractMetrics(contract)

  const groupToDisplay =
    groupLinks?.sort((a, b) => a.createdTime - b.createdTime)[0] ?? null
  const user = useUser()
  const [open, setOpen] = useState(false)
  const { width } = useWindowSize()
  const isMobile = (width ?? 0) < 600

  const groupInfo = groupToDisplay ? (
    <Row
      className={clsx(
        'items-center pr-2',
        isMobile ? 'max-w-[140px]' : 'max-w-[250px]'
      )}
    >
      <SiteLink href={groupPath(groupToDisplay.slug)} className={'truncate'}>
        <Row>
          <UserGroupIcon className="mx-1 inline h-5 w-5 shrink-0" />
          <span className="items-center truncate">{groupToDisplay.name}</span>
        </Row>
      </SiteLink>
    </Row>
  ) : (
    <Button
      size={'xs'}
      className={'max-w-[200px] pr-2'}
      color={'gray-white'}
      onClick={() => !groupToDisplay && setOpen(true)}
    >
      <Row>
        <UserGroupIcon className="mx-1 inline h-5 w-5 shrink-0" />
        <span className="truncate">No Group</span>
      </Row>
    </Button>
  )

  return (
    <Row className="flex-1 flex-wrap items-center gap-2 text-sm text-gray-500 md:gap-x-4 md:gap-y-2">
      <Row className="items-center gap-2">
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
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
            short={isMobile}
          />
        )}
        {!disabled && <UserFollowButton userId={creatorId} small />}
      </Row>
      <Row>
        {disabled ? (
          groupInfo
        ) : !groupToDisplay && !user ? (
          <div />
        ) : (
          <Row>
            {groupInfo}
            {user && groupToDisplay && (
              <Button
                size={'xs'}
                color={'gray-white'}
                onClick={() => setOpen(!open)}
              >
                <PencilIcon className="mb-0.5 mr-0.5 inline h-4 w-4 shrink-0" />
              </Button>
            )}
          </Row>
        )}
      </Row>
      <Modal open={open} setOpen={setOpen} size={'md'}>
        <Col
          className={
            'max-h-[70vh] min-h-[20rem] overflow-auto rounded bg-white p-6'
          }
        >
          <ContractGroupsList
            groupLinks={groupLinks ?? []}
            contract={contract}
            user={user}
          />
        </Col>
      </Modal>

      {(!!closeTime || !!resolvedDate) && (
        <Row className="hidden items-center gap-1 md:inline-flex">
          {resolvedDate && resolutionTime ? (
            <>
              <ClockIcon className="h-5 w-5" />
              <DateTimeTooltip text="Market resolved:" time={resolutionTime}>
                {resolvedDate}
              </DateTimeTooltip>
            </>
          ) : null}

          {!resolvedDate && closeTime && user && (
            <>
              <ClockIcon className="h-5 w-5" />
              <EditableCloseDate
                closeTime={closeTime}
                contract={contract}
                isCreator={isCreator ?? false}
              />
            </>
          )}
        </Row>
      )}
      {user && (
        <>
          <Row className="hidden items-center gap-1 md:inline-flex">
            <DatabaseIcon className="h-5 w-5" />
            <div className="whitespace-nowrap">{volumeLabel}</div>
          </Row>
          {!disabled && (
            <ContractInfoDialog
              contract={contract}
              className={'hidden md:inline-flex'}
            />
          )}
        </>
      )}
    </Row>
  )
}

export function ExtraMobileContractDetails(props: {
  contract: Contract
  user: User | null | undefined
  forceShowVolume?: boolean
}) {
  const { contract, user, forceShowVolume } = props
  const { volume, resolutionTime, closeTime, creatorId, uniqueBettorCount } =
    contract
  const uniqueBettors = uniqueBettorCount ?? 0
  const { resolvedDate } = contractMetrics(contract)
  const volumeTranslation =
    volume > 800 || uniqueBettors > 20
      ? 'High'
      : volume > 300 || uniqueBettors > 10
      ? 'Medium'
      : 'Low'

  return (
    <Row
      className={clsx(
        'items-center justify-around md:hidden',
        user ? 'w-full' : ''
      )}
    >
      {resolvedDate && resolutionTime ? (
        <Col className={'items-center text-sm'}>
          <Row className={'text-gray-500'}>
            <DateTimeTooltip text="Market resolved:" time={resolutionTime}>
              {resolvedDate}
            </DateTimeTooltip>
          </Row>
          <Row className={'text-gray-400'}>Ended</Row>
        </Col>
      ) : (
        !resolvedDate &&
        closeTime && (
          <Col className={'items-center text-sm text-gray-500'}>
            <EditableCloseDate
              closeTime={closeTime}
              contract={contract}
              isCreator={creatorId === user?.id}
            />
            <Row className={'text-gray-400'}>Ends</Row>
          </Col>
        )
      )}
      {(user || forceShowVolume) && (
        <Col className={'items-center text-sm text-gray-500'}>
          <Tooltip
            text={`${formatMoney(
              volume
            )} bet - ${uniqueBettors} unique bettors`}
          >
            {volumeTranslation}
          </Tooltip>
          <Row className={'text-gray-400'}>Activity</Row>
        </Col>
      )}
    </Row>
  )
}

function EditableCloseDate(props: {
  closeTime: number
  contract: Contract
  isCreator: boolean
}) {
  const { closeTime, contract, isCreator } = props

  const dayJsCloseTime = dayjs(closeTime)
  const dayJsNow = dayjs()

  const [isEditingCloseTime, setIsEditingCloseTime] = useState(false)
  const [closeDate, setCloseDate] = useState(
    closeTime && dayJsCloseTime.format('YYYY-MM-DD')
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = useState(
    closeTime && dayJsCloseTime.format('HH:mm')
  )

  const newCloseTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const isSameYear = dayJsCloseTime.isSame(dayJsNow, 'year')
  const isSameDay = dayJsCloseTime.isSame(dayJsNow, 'day')

  const onSave = () => {
    if (!newCloseTime) return

    if (newCloseTime === closeTime) setIsEditingCloseTime(false)
    else if (newCloseTime > Date.now()) {
      const content = contract.description
      const formattedCloseDate = dayjs(newCloseTime).format('YYYY-MM-DD h:mm a')

      const editor = new Editor({ content, extensions: exhibitExts })
      editor.commands.focus('end')
      insertContent(
        editor,
        `<br><p>Close date updated to ${formattedCloseDate}</p>`
      )

      updateContract(contract.id, {
        closeTime: newCloseTime,
        description: editor.getJSON(),
      })

      setIsEditingCloseTime(false)
    }
  }

  return (
    <>
      {isEditingCloseTime ? (
        <Row className="z-10 mr-2 w-full shrink-0 items-start items-center gap-1">
          <input
            type="date"
            className="input input-bordered shrink-0"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseDate(e.target.value)}
            min={Date.now()}
            value={closeDate}
          />
          <input
            type="time"
            className="input input-bordered shrink-0"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setCloseHoursMinutes(e.target.value)}
            min="00:00"
            value={closeHoursMinutes}
          />
          <Button size={'xs'} color={'blue'} onClick={onSave}>
            Done
          </Button>
        </Row>
      ) : (
        <DateTimeTooltip
          text={closeTime > Date.now() ? 'Trading ends:' : 'Trading ended:'}
          time={closeTime}
        >
          <span
            className={isCreator ? 'cursor-pointer' : ''}
            onClick={() => isCreator && setIsEditingCloseTime(true)}
          >
            {isSameYear
              ? dayJsCloseTime.format('MMM D')
              : dayJsCloseTime.format('MMM D, YYYY')}
            {isSameDay && <> ({fromNow(closeTime)})</>}
          </span>
        </DateTimeTooltip>
      )}
    </>
  )
}
