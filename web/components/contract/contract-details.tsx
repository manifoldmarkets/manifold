import { ClockIcon } from '@heroicons/react/outline'
import {
  ExclamationIcon,
  PencilIcon,
  PlusCircleIcon,
} from '@heroicons/react/solid'
import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import dayjs from 'dayjs'
import Link from 'next/link'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { useState } from 'react'
import { MiniUserFollowButton } from '../buttons/follow-button'
import { useUser, useUserById } from 'web/hooks/use-user'
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
        <Row className={'shrink-0 gap-1'}>
          <div className="font-semibold">{uniqueBettorCount || '0'} </div>
          trader
          {uniqueBettorCount !== 1 ? 's' : ''}
        </Row>
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
    <Row className="flex-wrap gap-2 sm:flex-nowrap">
      <MarketSubheader contract={contract} />
      <MarketGroups contract={contract} />
      <ExtraContractActionsRow contract={contract} />
    </Row>
  )
}

export function MarketSubheader(props: { contract: Contract }) {
  const { contract } = props
  const { creatorName, creatorUsername, creatorId, creatorAvatarUrl } = contract
  const user = useUser()
  const creator = useUserById(creatorId)
  const correctResolutionPercentage = creator?.fractionResolvedCorrectly
  const isCreator = user?.id === creatorId
  return (
    <Row className="relative grow">
      <Avatar
        username={creatorUsername}
        avatarUrl={creatorAvatarUrl}
        size={9}
        className="mr-1.5"
      />

      <div className="absolute bottom-0 ml-5 flex h-5 w-5 items-center justify-center sm:-bottom-1">
        <MiniUserFollowButton userId={creatorId} />
      </div>

      <Col className="ml-2 flex-1 text-sm text-gray-600">
        <Row className="gap-1">
          <UserLink
            className="my-auto whitespace-nowrap"
            name={creatorName}
            username={creatorUsername}
          />
          {/* <BadgeDisplay user={creator} className="mr-1" /> */}
          {correctResolutionPercentage != null &&
            correctResolutionPercentage < BAD_CREATOR_THRESHOLD && (
              <Tooltip
                text="This creator has a track record of creating markets that are resolved incorrectly."
                placement="bottom"
                className="w-fit"
              >
                <ExclamationIcon className="h-6 w-6 text-yellow-500" />
              </Tooltip>
            )}
        </Row>
        <div className="text-2xs text-gray-400 sm:text-xs">
          <CloseOrResolveTime contract={contract} isCreator={isCreator} />
        </div>
      </Col>
    </Row>
  )
}

export function CloseOrResolveTime(props: {
  contract: Contract
  isCreator: boolean
  disabled?: boolean
}) {
  const { contract, isCreator, disabled } = props
  const { resolvedDate } = contractMetrics(contract)
  const { resolutionTime, closeTime } = contract
  if (!!closeTime || !!resolvedDate) {
    return (
      <Row className="select-none flex-nowrap items-center gap-1">
        {resolvedDate && resolutionTime ? (
          <DateTimeTooltip
            className="whitespace-nowrap"
            text="Market resolved:"
            time={resolutionTime}
          >
            resolved {resolvedDate}
          </DateTimeTooltip>
        ) : null}

        {!resolvedDate && closeTime && (
          <div className="flex gap-1 whitespace-nowrap">
            <EditableCloseDate
              closeTime={closeTime}
              contract={contract}
              isCreator={isCreator ?? false}
              disabled={disabled}
            />
          </div>
        )}
      </Row>
    )
  } else return <></>
}

function MarketGroups(props: { contract: Contract; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const user = useUser()
  const { contract, disabled } = props
  const groupsToDisplay = getGroupLinksToDisplay(contract)

  return (
    <>
      {/* Put after market action icons on mobile, but before them on desktop*/}
      <Row className="order-last w-full flex-wrap items-end gap-1 sm:order-[unset]">
        {groupsToDisplay.map((group) => (
          <GroupDisplay
            key={group.groupId}
            groupToDisplay={group}
            disabled={disabled}
          />
        ))}

        {!disabled && user && (
          <button
            className="text-gray-400 hover:text-gray-300"
            onClick={() => setOpen(true)}
          >
            <PlusCircleIcon className="h-[20px]" />
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

export function GroupDisplay(props: {
  groupToDisplay?: GroupLink | null
  disabled?: boolean
}) {
  const { groupToDisplay, disabled } = props

  if (groupToDisplay) {
    const groupSection = (
      <a
        className={clsx(
          'max-w-[200px] truncate whitespace-nowrap rounded-full bg-gray-400 py-0.5 px-2 text-xs text-white sm:max-w-[250px]',
          !disabled && 'cursor-pointer hover:bg-gray-300'
        )}
      >
        {groupToDisplay.name}
      </a>
    )

    return disabled ? (
      groupSection
    ) : (
      <Link
        prefetch={false}
        href={groupPath(groupToDisplay.slug)}
        legacyBehavior
      >
        {groupSection}
      </Link>
    )
  } else
    return (
      <div className="truncate rounded-full bg-gray-400 py-0.5 px-2 text-xs text-white">
        No Group
      </div>
    )
}

function EditableCloseDate(props: {
  closeTime: number
  contract: Contract
  isCreator: boolean
  disabled?: boolean
}) {
  const { closeTime, contract, isCreator, disabled } = props

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
      <DateTimeTooltip
        text={
          isClient && closeTime <= Date.now()
            ? 'Trading ended:'
            : 'Trading ends:'
        }
        time={closeTime}
        placement="bottom-start"
      >
        <Row
          className={clsx(
            'items-center gap-1',
            !disabled && isCreator ? 'cursor-pointer' : ''
          )}
          onClick={() => !disabled && isCreator && setIsEditingCloseTime(true)}
        >
          <span>{dayjs().isBefore(closeTime) ? 'closes' : 'closed'} </span>
          {isSameDay && isClient ? (
            <span className={'capitalize'}> {fromNow(closeTime)}</span>
          ) : isSameYear ? (
            dayJsCloseTime.format('MMM D')
          ) : (
            dayJsCloseTime.format('MMM D, YYYY')
          )}
          {isCreator && !disabled && <PencilIcon className="h-4 w-4" />}
        </Row>
      </DateTimeTooltip>
    </>
  )
}

export const BAD_CREATOR_THRESHOLD = 0.8
