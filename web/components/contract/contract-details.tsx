import { ClockIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import dayjs from 'dayjs'
import Link from 'next/link'

import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../avatar'
import { useState } from 'react'
import NewContractBadge from '../new-contract-badge'
import { MiniUserFollowButton } from '../follow-button'
import { DAY_MS } from 'common/util/time'
import { useUser } from 'web/hooks/use-user'
import { exhibitExts } from 'common/util/parse'
import { Button } from 'web/components/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { linkClass } from 'web/components/site-link'
import { getGroupLinkToDisplay, groupPath } from 'web/lib/firebase/groups'
import { insertContent } from '../editor/utils'
import { contractMetrics } from 'common/contract-details'
import { UserLink } from 'web/components/user-link'
import { FeaturedContractBadge } from 'web/components/contract/featured-contract-badge'
import { Tooltip } from 'web/components/tooltip'
import { useWindowSize } from 'web/hooks/use-window-size'
import { ExtraContractActionsRow } from './extra-contract-actions-row'
import { PlusCircleIcon } from '@heroicons/react/solid'

export type ShowTime = 'resolve-date' | 'close-date'

export function MiscDetails(props: {
  contract: Contract
  showTime?: ShowTime
  hideGroupLink?: boolean
}) {
  const { contract, showTime, hideGroupLink } = props
  const { volume, closeTime, isResolved, createdTime, resolutionTime } =
    contract

  const isNew = createdTime > Date.now() - DAY_MS && !isResolved
  const groupToDisplay = getGroupLinkToDisplay(contract)

  return (
    <Row className="items-center gap-3 truncate text-sm text-gray-400">
      {showTime === 'close-date' ? (
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

      {!hideGroupLink && groupToDisplay && (
        <Link prefetch={false} href={groupPath(groupToDisplay.slug)}>
          <a className={clsx(linkClass, 'truncate text-sm text-gray-400')}>
            {groupToDisplay.name}
          </a>
        </Link>
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

export function useIsMobile() {
  const { width } = useWindowSize()
  return (width ?? 0) < 600
}

export function ContractDetails(props: {
  contract: Contract
  disabled?: boolean
}) {
  const { contract, disabled } = props
  const { creatorName, creatorUsername, creatorId, creatorAvatarUrl } = contract
  const { volumeLabel, resolvedDate } = contractMetrics(contract)
  const user = useUser()
  const isCreator = user?.id === creatorId
  const isMobile = useIsMobile()

  return (
    <Col>
      <Row>
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          noLink={disabled}
          size={9}
          className="mr-1.5"
        />
        {!disabled && (
          <div className="absolute mt-3 ml-[11px]">
            <MiniUserFollowButton userId={creatorId} />
          </div>
        )}
        <Col className="text-greyscale-6 ml-2 flex-1 flex-wrap text-sm">
          <Row className="w-full justify-between ">
            {disabled ? (
              creatorName
            ) : (
              <UserLink
                className="my-auto whitespace-nowrap"
                name={creatorName}
                username={creatorUsername}
                short={isMobile}
              />
            )}
          </Row>
          <Row className="text-2xs text-greyscale-4 gap-2 sm:text-xs">
            <CloseOrResolveTime
              contract={contract}
              resolvedDate={resolvedDate}
              isCreator={isCreator}
            />
            {!isMobile && (
              <MarketGroups
                contract={contract}
                isMobile={isMobile}
                disabled={disabled}
              />
            )}
          </Row>
        </Col>
        <div className="mt-0">
          <ExtraContractActionsRow contract={contract} />
        </div>
      </Row>
      {/* GROUPS */}
      {isMobile && (
        <div className="mt-2">
          <MarketGroups
            contract={contract}
            isMobile={isMobile}
            disabled={disabled}
          />
        </div>
      )}
    </Col>
  )
}

export function CloseOrResolveTime(props: {
  contract: Contract
  resolvedDate: any
  isCreator: boolean
}) {
  const { contract, resolvedDate, isCreator } = props
  const { resolutionTime, closeTime } = contract
  console.log(closeTime, resolvedDate)
  if (!!closeTime || !!resolvedDate) {
    return (
      <Row className="select-none items-center gap-1">
        {resolvedDate && resolutionTime ? (
          <>
            <DateTimeTooltip text="Market resolved:" time={resolutionTime}>
              <Row>
                <div>resolved&nbsp;</div>
                {resolvedDate}
              </Row>
            </DateTimeTooltip>
          </>
        ) : null}

        {!resolvedDate && closeTime && (
          <Row>
            {dayjs().isBefore(closeTime) && <div>closes&nbsp;</div>}
            {!dayjs().isBefore(closeTime) && <div>closed&nbsp;</div>}
            <EditableCloseDate
              closeTime={closeTime}
              contract={contract}
              isCreator={isCreator ?? false}
            />
          </Row>
        )}
      </Row>
    )
  } else return <></>
}

export function MarketGroups(props: {
  contract: Contract
  isMobile: boolean | undefined
  disabled: boolean | undefined
}) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { contract, isMobile, disabled } = props
  const groupToDisplay = getGroupLinkToDisplay(contract)
  const groupInfo = groupToDisplay ? (
    <Link prefetch={false} href={groupPath(groupToDisplay.slug)}>
      <a
        className={clsx(
          'flex flex-row items-center truncate pr-1',
          isMobile ? 'max-w-[140px]' : 'max-w-[250px]'
        )}
      >
        <div className="bg-greyscale-4 hover:bg-greyscale-3 text-2xs items-center truncate rounded-full px-2 text-white sm:text-xs">
          {groupToDisplay.name}
        </div>
      </a>
    </Link>
  ) : (
    <Row
      className={clsx(
        'cursor-default select-none items-center truncate pr-1',
        isMobile ? 'max-w-[140px]' : 'max-w-[250px]'
      )}
    >
      <div
        className={clsx(
          'bg-greyscale-4 text-2xs items-center truncate rounded-full px-2 text-white sm:text-xs'
        )}
      >
        No Group
      </div>
    </Row>
  )
  return (
    <>
      <Row className="align-middle">
        {disabled ? (
          { groupInfo }
        ) : (
          // !user ? (
          //   <div />
          // ) :
          <Row>
            {groupInfo}
            {user && (
              <button
                className="text-greyscale-4 hover:text-greyscale-3"
                onClick={() => setOpen(!open)}
              >
                <PlusCircleIcon className="mb-0.5 mr-0.5 inline h-4 w-4 shrink-0" />
              </button>
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
          <ContractGroupsList contract={contract} user={user} />
        </Col>
      </Modal>
    </>
  )
}

export function ExtraMobileContractDetails(props: {
  contract: Contract
  forceShowVolume?: boolean
}) {
  const { contract, forceShowVolume } = props
  const { volume, resolutionTime, closeTime, creatorId, uniqueBettorCount } =
    contract
  const user = useUser()
  const uniqueBettors = uniqueBettorCount ?? 0
  const { resolvedDate } = contractMetrics(contract)
  const volumeTranslation =
    volume > 800 || uniqueBettors >= 20
      ? 'High'
      : volume > 300 || uniqueBettors >= 10
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
            <Row className={'text-gray-400'}>Closes&nbsp;</Row>
            <EditableCloseDate
              closeTime={closeTime}
              contract={contract}
              isCreator={creatorId === user?.id}
            />
          </Col>
        )
      )}
      {(user || forceShowVolume) && (
        <Col className={'items-center text-sm text-gray-500'}>
          <Tooltip
            text={`${formatMoney(
              volume
            )} bet - ${uniqueBettors} unique traders`}
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
        <Row className="z-10 mr-2 w-full shrink-0 items-center gap-1">
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
            {isSameDay ? (
              <span className={'capitalize'}> {fromNow(closeTime)}</span>
            ) : isSameYear ? (
              dayJsCloseTime.format('MMM D')
            ) : (
              dayJsCloseTime.format('MMM D, YYYY')
            )}
          </span>
        </DateTimeTooltip>
      )}
    </>
  )
}
