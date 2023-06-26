import { ClockIcon, UserGroupIcon } from '@heroicons/react/outline'
import {
  FireIcon,
  LockClosedIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Link from 'next/link'
import { Row } from '../layout/row'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { linkClass } from 'web/components/widgets/site-link'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  GroupLink,
  getGroupLinkToDisplay,
  getGroupLinksToDisplay,
  groupPath,
} from 'common/group'
import { Title } from '../widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { Input } from '../widgets/input'
import { IoEllipsisHorizontal } from 'react-icons/io5'

export type ShowTime = 'resolve-date' | 'close-date'

export function MiscDetails(props: {
  contract: Contract
  showTime?: ShowTime
  hideGroupLink?: boolean
}) {
  const { contract, showTime, hideGroupLink } = props
  const { closeTime, resolutionTime, uniqueBettorCount } = contract

  const isClient = useIsClient()
  // const isNew = createdTime > Date.now() - DAY_MS && !isResolved
  const groupToDisplay = getGroupLinkToDisplay(contract)
  const isOpen =
    !contract.isResolved && (contract.closeTime ?? Infinity) > Date.now()

  return (
    <Row className="text-ink-400 w-full items-center gap-3 text-sm">
      {isOpen && contract.elasticity < 0.5 ? (
        <Tooltip text={'High-stakes'} className={'z-10'}>
          <FireIcon className="h-5 w-5 text-blue-700" />
        </Tooltip>
      ) : null}

      {isClient && showTime === 'close-date' ? (
        <Row className="gap-0.5 whitespace-nowrap">
          <ClockIcon className="h-5 w-5" />
          {(closeTime || 0) < Date.now() ? 'Closed' : 'Closes'}{' '}
          {fromNow(closeTime || 0)}
        </Row>
      ) : isClient && showTime === 'resolve-date' && resolutionTime ? (
        <Row className="gap-0.5">
          <ClockIcon className="h-5 w-5" />
          {'Resolved '}
          {fromNow(resolutionTime)}
        </Row>
      ) : (uniqueBettorCount ?? 0) > 1 ? (
        <Tooltip
          text={`${uniqueBettorCount} unique traders`}
          className={'z-10'}
        >
          <Row className={'shrink-0 items-center gap-1'}>
            <UserGroupIcon className="h-4 w-4" />
            <div className="font-semibold">{uniqueBettorCount || '0'}</div>
          </Row>
        </Tooltip>
      ) : (
        <></>
      )}

      {!hideGroupLink && groupToDisplay && (
        <Link
          prefetch={false}
          href={groupPath(groupToDisplay.slug)}
          className={clsx(
            linkClass,
            'text-ink-400 z-10 max-w-[8rem] truncate text-sm'
          )}
        >
          {groupToDisplay.name}
        </Link>
      )}
    </Row>
  )
}

export function MarketGroups(props: { contract: Contract }) {
  const { contract } = props
  if (contract.visibility === 'private') {
    return <PrivateMarketGroups contract={contract} />
  } else {
    return <PublicMarketGroups contract={contract} />
  }
}

function PrivateMarketGroups(props: { contract: Contract }) {
  const { contract } = props
  if (contract.groupLinks) {
    return (
      <div className="flex">
        <GroupDisplay groupToDisplay={contract.groupLinks[0]} isPrivate />
      </div>
    )
  }
  return <></>
}

export function CloseOrResolveTime(props: {
  contract: Contract
  editable?: boolean
  className?: string
}) {
  const { contract, editable, className } = props
  const { resolutionTime, closeTime, isResolved } = contract
  if (contract.outcomeType === 'STONK') {
    return <></>
  }

  if (!!closeTime || !!isResolved) {
    return (
      <Row className={clsx('select-none items-center', className)}>
        {isResolved && resolutionTime && (
          <DateTimeTooltip
            className="whitespace-nowrap"
            text="Question resolved:"
            time={resolutionTime}
            placement="bottom-start"
          >
            resolved {dayjs(resolutionTime).format('MMM D')}
          </DateTimeTooltip>
        )}

        {!isResolved && closeTime && (
          <EditableCloseDate
            closeTime={closeTime}
            contract={contract}
            editable={!!editable}
          />
        )}
      </Row>
    )
  } else return <></>
}

export function PublicMarketGroups(props: {
  contract: Contract
  className?: string
  justGroups?: boolean
}) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { contract, className, justGroups } = props
  const groupsToDisplay = getGroupLinksToDisplay(contract)

  return (
    <>
      <Row
        className={clsx(
          'w-full flex-wrap items-end gap-1',
          (!groupsToDisplay || groupsToDisplay.length == 0) && justGroups
            ? 'hidden'
            : '',
          className
        )}
      >
        {groupsToDisplay.map((group) => (
          <GroupDisplay key={group.groupId} groupToDisplay={group} />
        ))}

        {user && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
            }}
          >
            {groupsToDisplay.length ? (
              <IoEllipsisHorizontal className="text-ink-1000 bg-ink-100 hover:bg-ink-200 h-6 w-6 rounded-full bg-opacity-90 px-1" />
            ) : (
              <span
                className={clsx(
                  'bg-ink-400 hover:bg-ink-400/75 text-ink-0 flex items-center rounded-full py-0.5 px-2 text-sm'
                )}
              >
                <PlusIcon className="mr-1 h-4 w-4" /> Group
              </span>
            )}
          </button>
        )}
      </Row>
      <Modal open={open} setOpen={setOpen} size={'md'}>
        <Col
          className={
            'bg-canvas-0 max-h-[70vh] min-h-[20rem] overflow-auto rounded p-6'
          }
        >
          <ContractGroupsList contract={contract} user={user} />
        </Col>
      </Modal>
    </>
  )
}

function GroupDisplay(props: {
  groupToDisplay: GroupLink
  isPrivate?: boolean
}) {
  const { groupToDisplay, isPrivate } = props

  return (
    <Link
      prefetch={false}
      href={groupPath(groupToDisplay.slug)}
      onClick={(e) => {
        e.stopPropagation()
      }}
      className={clsx(
        'text-ink-1000 bg-ink-100 hover:bg-ink-200 w-fit max-w-[200px] truncate whitespace-nowrap rounded-full bg-opacity-90 py-0.5 px-2 text-sm sm:max-w-[250px]',
        isPrivate
          ? 'text-ink-1000 bg-indigo-200 dark:bg-indigo-700'
          : 'bg-ink-400 text-ink-0'
      )}
    >
      <Row className="gap-0.5">
        {isPrivate && <LockClosedIcon className="my-auto h-3 w-3" />}
        {groupToDisplay.name}
      </Row>
    </Link>
  )
}

function EditableCloseDate(props: {
  closeTime: number
  contract: Contract
  editable: boolean
}) {
  const { closeTime, contract, editable } = props

  const isClient = useIsClient()
  const dayJsCloseTime = dayjs(closeTime)
  const dayJsNow = dayjs()

  const [isEditingCloseTime, setIsEditingCloseTime] = useState(false)
  const [closeDate, setCloseDate] = useState(
    closeTime && dayJsCloseTime.format('YYYY-MM-DD')
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = useState(
    closeTime && dayJsCloseTime.format('HH:mm')
  )

  const isSameYear = dayJsCloseTime.isSame(dayJsNow, 'year')
  const isSameDay = dayJsCloseTime.isSame(dayJsNow, 'day')
  const isSoon = dayJsCloseTime.diff(dayJsNow, 'month') < 4

  let newCloseTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  function onSave(customTime?: number) {
    if (customTime) {
      newCloseTime = customTime
      setCloseDate(dayjs(newCloseTime).format('YYYY-MM-DD'))
      setCloseHoursMinutes(dayjs(newCloseTime).format('HH:mm'))
    }
    if (!newCloseTime) return

    setIsEditingCloseTime(false)
    if (newCloseTime !== closeTime) {
      updateContract(contract.id, {
        closeTime: newCloseTime,
      })
    }
  }

  return (
    <>
      <Modal
        size="md"
        open={isEditingCloseTime}
        setOpen={setIsEditingCloseTime}
        position="top"
      >
        <Col className="bg-canvas-0 rounded p-8">
          <Title className="!text-2xl">Question close time</Title>
          <div className="mb-4">
            Change when this question closes. All trading will be halted at this
            time.
          </div>
          <Row className="flex-wrap items-center justify-end gap-2">
            <Input
              type="date"
              className="w-full shrink-0 sm:w-fit"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setCloseDate(e.target.value)}
              min={isClient ? Date.now() : undefined}
              value={closeDate}
            />
            <Input
              type="time"
              className="w-full shrink-0 sm:w-max"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setCloseHoursMinutes(e.target.value)}
              min="00:00"
              value={closeHoursMinutes}
            />
            <Button color={'indigo'} onClick={() => onSave()}>
              Save
            </Button>
          </Row>

          {(contract.closeTime ?? Date.now() + 1) > Date.now() && (
            <Row className="align-center mt-8">
              <div className="mt-1 mr-2">Or close question now:</div>
              <Button
                className=""
                size={'xs'}
                color="gray"
                onClick={() => onSave(Date.now())}
              >
                Close question
              </Button>
            </Row>
          )}
        </Col>
      </Modal>

      <Row
        className={clsx('items-center gap-1', editable ? 'cursor-pointer' : '')}
        onClick={() => editable && setIsEditingCloseTime(true)}
      >
        <DateTimeTooltip
          text={closeTime <= Date.now() ? 'Trading ended:' : 'Trading ends:'}
          time={closeTime}
          placement="bottom-end"
          noTap
          className="flex items-center"
        >
          {dayjs().isBefore(closeTime) ? 'closes' : 'closed'}{' '}
          {isSameDay
            ? fromNow(closeTime)
            : isSameYear || isSoon
            ? dayJsCloseTime.format('MMM D')
            : dayJsCloseTime.format('YYYY')}
        </DateTimeTooltip>
        {editable && <PencilIcon className="h-4 w-4" />}
      </Row>
    </>
  )
}
