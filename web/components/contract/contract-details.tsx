import { ClockIcon, UserGroupIcon } from '@heroicons/react/outline'
import {
  DotsCircleHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import dayjs from 'dayjs'
import Link from 'next/link'
import { Row } from '../layout/row'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { useState } from 'react'
import { MiniUserFollowButton } from '../buttons/follow-button'
import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { linkClass } from 'web/components/widgets/site-link'
import {
  getGroupLinksToDisplay,
  getGroupLinkToDisplay,
} from 'web/lib/firebase/groups'
import { insertContent } from '../editor/utils'
import { contractMetrics } from 'common/contract-details'
import { UserLink } from 'web/components/widgets/user-link'
import { Tooltip } from 'web/components/widgets/tooltip'
import { ExtraContractActionsRow } from './extra-contract-actions-row'
import { GroupLink, groupPath } from 'common/group'
import { Subtitle } from '../widgets/subtitle'
import { useIsClient } from 'web/hooks/use-is-client'
import { Input } from '../widgets/input'
import { editorExtensions } from '../widgets/editor'

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

  return (
    <Row className="w-full items-center gap-3 text-sm text-gray-400">
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
        <Tooltip text={'Unique traders'} className={'z-10'}>
          <Row className={'shrink-0 items-center gap-1'}>
            <div className="font-semibold">{uniqueBettorCount || '0'} </div>
            <UserGroupIcon className="h-4 w-4" />
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
            'z-10 max-w-[8rem] truncate text-sm text-gray-400'
          )}
        >
          {groupToDisplay.name}
        </Link>
      )}
    </Row>
  )
}

export function AvatarDetails(props: {
  contract: Contract
  className?: string
  short?: boolean
  noLink?: boolean
}) {
  const { contract, short, className, noLink } = props
  const { creatorName, creatorUsername, creatorAvatarUrl } = contract

  return (
    <Row
      className={clsx('items-center gap-2 text-sm text-gray-400', className)}
    >
      <Avatar
        username={creatorUsername}
        avatarUrl={creatorAvatarUrl}
        size={4}
        noLink={noLink}
      />
      <UserLink
        name={creatorName}
        username={creatorUsername}
        short={short}
        noLink={noLink}
      />
    </Row>
  )
}

export function ContractDetails(props: { contract: Contract }) {
  const { contract } = props

  return (
    <Row className="flex-wrap gap-4 sm:flex-nowrap">
      <MarketSubheader contract={contract} />
      <MarketGroups contract={contract} />
      <ExtraContractActionsRow contract={contract} />
    </Row>
  )
}

export function MarketSubheader(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername, creatorId, creatorAvatarUrl } = contract
  return (
    <Row className="grow items-center gap-3">
      <div className="relative">
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size={9}
        />
        <MiniUserFollowButton
          userId={creatorId}
          className="absolute -bottom-1 -right-1"
        />
      </div>

      <Col className="whitespace-nowrap text-sm">
        <UserLink
          className="text-gray-600"
          name={creatorName}
          username={creatorUsername}
        />
        <span className="text-xs font-light text-gray-400">
          <CloseOrResolveTime contract={contract} />
        </span>
      </Col>
    </Row>
  )
}

export function CloseOrResolveTime(props: {
  contract: Contract
  editable?: boolean
}) {
  const { contract, editable } = props
  const { resolvedDate } = contractMetrics(contract)
  const { resolutionTime, closeTime } = contract
  if (!!closeTime || !!resolvedDate) {
    return (
      <Row className="select-none items-center">
        {resolvedDate && resolutionTime && (
          <DateTimeTooltip
            className="whitespace-nowrap"
            text="Market resolved:"
            time={resolutionTime}
            placement="bottom-start"
          >
            resolved {resolvedDate}
          </DateTimeTooltip>
        )}

        {!resolvedDate && closeTime && (
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

function MarketGroups(props: { contract: Contract }) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { contract } = props
  const groupsToDisplay = getGroupLinksToDisplay(contract)

  return (
    <>
      {/* Put after market action icons on mobile, but before them on desktop*/}
      <Row className="order-last w-full flex-wrap items-end gap-1 sm:order-[unset]">
        {groupsToDisplay.map((group) => (
          <GroupDisplay key={group.groupId} groupToDisplay={group} />
        ))}

        {user && (
          <button onClick={() => setOpen(true)}>
            {groupsToDisplay.length ? (
              <DotsCircleHorizontalIcon className="h-[20px] text-gray-400 hover:text-gray-400/75" />
            ) : (
              <span className="flex items-center rounded-full bg-gray-400 py-0.5 px-2 text-xs font-light text-white hover:bg-gray-400/75">
                <PlusIcon className="mr-1 h-3 w-3" /> Group
              </span>
            )}
          </button>
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

function GroupDisplay(props: { groupToDisplay: GroupLink }) {
  const { groupToDisplay } = props

  return (
    <Link prefetch={false} href={groupPath(groupToDisplay.slug)} legacyBehavior>
      <a
        className={clsx(
          'max-w-[200px] truncate whitespace-nowrap rounded-full bg-gray-400 py-0.5 px-2 text-xs font-light text-white sm:max-w-[250px]'
        )}
      >
        {groupToDisplay.name}
      </a>
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

    if (newCloseTime === closeTime) setIsEditingCloseTime(false)
    else {
      const content = contract.description
      const formattedCloseDate = dayjs(newCloseTime).format('YYYY-MM-DD h:mm a')

      const editor = new Editor({ content, extensions: editorExtensions() })
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
      <Modal
        size="md"
        open={isEditingCloseTime}
        setOpen={setIsEditingCloseTime}
        position="top"
      >
        <Col className="rounded bg-white px-8 pb-8">
          <Subtitle text="Change when this market closes" />
          <Row className="mt-4 flex-wrap items-center justify-center gap-2">
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
            <Row className={'justify-center'}>
              <Button
                className="mt-8"
                size={'sm'}
                color="gray-white"
                onClick={() => onSave(Date.now())}
              >
                (Or, close this market now)
              </Button>
            </Row>
          )}
        </Col>
      </Modal>

      <Row
        className={clsx('items-center gap-1', editable ? 'cursor-pointer' : '')}
        onClick={() => editable && setIsEditingCloseTime(true)}
      >
        {editable && <PencilIcon className="h-4 w-4" />}
        <DateTimeTooltip
          text={closeTime <= Date.now() ? 'Trading ended:' : 'Trading ends:'}
          time={closeTime}
          placement="bottom-start"
          noTap
        >
          <span suppressHydrationWarning>
            {dayjs().isBefore(closeTime) ? 'closes' : 'closed'}{' '}
          </span>
          {isSameDay ? (
            <span className={'capitalize'} suppressHydrationWarning>
              {' '}
              {fromNow(closeTime)}
            </span>
          ) : isSameYear ? (
            dayJsCloseTime.format('MMM D')
          ) : (
            dayJsCloseTime.format('MMM D, YYYY')
          )}
        </DateTimeTooltip>
      </Row>
    </>
  )
}
