import { ClockIcon, UserGroupIcon } from '@heroicons/react/outline'
import {
  DotsCircleHorizontalIcon,
  FireIcon,
  LockClosedIcon,
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
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { linkClass } from 'web/components/widgets/site-link'
import {
  getGroupLinksToDisplay,
  getGroupLinkToDisplay,
} from 'web/lib/firebase/groups'
import { UserLink } from 'web/components/widgets/user-link'
import { Tooltip } from 'web/components/widgets/tooltip'
import { GroupLink, groupPath } from 'common/group'
import { Title } from '../widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { Input } from '../widgets/input'
import { editorExtensions } from '../widgets/editor'
import { LikeButton } from './like-button'

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

export function AuthorInfo(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername, creatorAvatarUrl, creatorCreatedTime } =
    contract

  return (
    <Row className="grow items-center gap-2">
      <div className="relative">
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size={6}
        />
      </div>

      <UserLink
        name={creatorName}
        username={creatorUsername}
        createdTime={creatorCreatedTime}
      />
    </Row>
  )
}

export function CloseOrResolveTime(props: {
  contract: Contract
  editable?: boolean
}) {
  const { contract, editable } = props
  const { resolutionTime, closeTime, isResolved } = contract

  if (!!closeTime || !!isResolved) {
    return (
      <Row className="select-none items-center font-light">
        {isResolved && resolutionTime && (
          <DateTimeTooltip
            className="whitespace-nowrap"
            text="Market resolved:"
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

function PublicMarketGroups(props: { contract: Contract }) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { contract } = props
  const groupsToDisplay = getGroupLinksToDisplay(contract)

  return (
    <>
      <Row className="w-full flex-wrap items-end gap-1">
        {groupsToDisplay.map((group) => (
          <GroupDisplay key={group.groupId} groupToDisplay={group} />
        ))}

        {user && (
          <button onClick={() => setOpen(true)}>
            {groupsToDisplay.length ? (
              <DotsCircleHorizontalIcon className="text-ink-400 hover:text-ink-400/75 h-[20px]" />
            ) : (
              <span className="bg-ink-400 hover:bg-ink-400/75 text-ink-0 flex items-center rounded-full py-0.5 px-2 text-xs font-light">
                <PlusIcon className="mr-1 h-3 w-3" /> Group
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
    <Link prefetch={false} href={groupPath(groupToDisplay.slug)} legacyBehavior>
      <a
        className={clsx(
          'w-fit max-w-[200px] truncate whitespace-nowrap rounded-full py-0.5 px-2 text-xs font-light sm:max-w-[250px]',
          isPrivate
            ? 'text-ink-1000 bg-indigo-200 dark:bg-indigo-700'
            : 'bg-ink-400 text-ink-0'
        )}
      >
        <Row className="gap-0.5">
          {isPrivate && <LockClosedIcon className="my-auto h-3 w-3" />}
          {groupToDisplay.name}
        </Row>
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
      const editor = new Editor({ content, extensions: editorExtensions() })
      editor.commands.focus('end')

      // const formattedCloseDate = dayjs(newCloseTime).format('YYYY-MM-DD h:mm a')
      // insertContent(
      //   editor,
      //   `<p></p><p>Close date updated to ${formattedCloseDate}</p>`
      // )

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
        <Col className="bg-canvas-0 items-center rounded p-8">
          <Title className="!text-2xl">Change when this market closes</Title>
          <Row className="flex-wrap items-center justify-center gap-2">
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
            <Button
              className="mt-8"
              size={'sm'}
              color="gray-white"
              onClick={() => onSave(Date.now())}
            >
              (Or, close this market now)
            </Button>
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
        {editable && <PencilIcon className="h-4 w-4" />}
      </Row>
    </>
  )
}

export const ContractLike = (props: { contract: Contract }) => {
  const { contract } = props
  const user = useUser()
  const privateUser = usePrivateUser()

  return (
    <LikeButton
      contentId={contract.id}
      contentCreatorId={contract.creatorId}
      user={user}
      contentType={'contract'}
      totalLikes={contract.likedByUserCount ?? 0}
      contract={contract}
      contentText={contract.question}
      className={clsx(
        '-mr-2',
        isBlocked(privateUser, contract.creatorId) && 'pointer-events-none'
      )}
    />
  )
}
