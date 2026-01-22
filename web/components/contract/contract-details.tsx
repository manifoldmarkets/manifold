import { PencilIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { Row } from '../layout/row'
import { Contract } from 'common/contract'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { fromNow } from 'client-common/lib/time'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Title } from '../widgets/title'
import { useIsClient } from 'web/hooks/use-is-client'
import { Input } from '../widgets/input'
import { Avatar } from '../widgets/avatar'
import { UserLink } from '../widgets/user-link'
import { NO_CLOSE_TIME_TYPES } from 'common/contract'
import { updateMarket } from 'web/lib/api/api'
import { FaClock } from 'react-icons/fa6'
import { MdLockClock } from 'react-icons/md'
import { UserHovercard } from '../user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

export function AuthorInfo(props: {
  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string
  creatorCreatedTime?: number
  token: string
  resolverId?: string
}) {
  const {
    creatorId,
    creatorName,
    creatorUsername,
    creatorAvatarUrl,
    creatorCreatedTime,
    token,
    resolverId,
  } = props
  const resolver = useDisplayUserById(resolverId)
  const creator = useDisplayUserById(creatorId)
  return (
    <Row className="grow flex-wrap items-center gap-4">
      <UserHovercard userId={creatorId} className="flex items-center gap-2">
        <Avatar
          username={creatorUsername}
          avatarUrl={creatorAvatarUrl}
          size={'xs'}
          entitlements={creator?.entitlements}
          displayContext="market_creator"
        />

        <UserLink
          user={{
            id: creatorId,
            name: creatorName,
            username: creatorUsername,
            createdTime: creatorCreatedTime,
            entitlements: creator?.entitlements,
          }}
          className={'mr-1'}
          displayContext="market_creator"
        />
      </UserHovercard>

      {resolver && resolver.id !== creatorId && token !== 'CASH' && (
        <span>
          resolved by{' '}
          <UserHovercard userId={resolver.id}>
            <UserLink user={resolver} />
          </UserHovercard>
        </span>
      )}
    </Row>
  )
}

export function CloseOrResolveTime(props: {
  contract: Contract
  editable?: boolean
  className?: string
}) {
  const { contract, editable, className } = props
  const { resolutionTime, closeTime, isResolved } = contract
  if (contract.outcomeType === 'STONK') return null

  return (
    <Row className={clsx('select-none items-center', className)}>
      {isResolved && resolutionTime && (
        <DateTimeTooltip
          className="whitespace-nowrap"
          time={resolutionTime}
          placement="bottom-start"
        >
          resolved {dayjs(resolutionTime).format('MMM D')}
        </DateTimeTooltip>
      )}

      {!isResolved && (
        <CloseDate
          closeTime={closeTime}
          contract={contract}
          editable={!!editable}
        />
      )}
    </Row>
  )
}

export function CloseDate(props: {
  closeTime: number | undefined
  contract: Contract
  editable?: boolean
}) {
  const { closeTime, contract, editable } = props

  const [isEditingCloseTime, setIsEditingCloseTime] = useState(false)
  const dayJsCloseTime = dayjs(closeTime)
  const dayJsNow = dayjs()
  const isSameYear = dayJsCloseTime.isSame(dayJsNow, 'year')
  const isSameDay = dayJsCloseTime.isSame(dayJsNow, 'day')
  const isSoon = dayJsCloseTime.diff(dayJsNow, 'month') < 4
  const almostForeverTime = dayjs(contract.createdTime).add(
    dayjs.duration(900, 'year')
  )
  const neverCloses =
    !closeTime ||
    (NO_CLOSE_TIME_TYPES.includes(contract.outcomeType) &&
      dayjs(closeTime).isAfter(almostForeverTime))

  return (
    <>
      <Row
        className={clsx(
          'group items-center gap-1',
          editable ? 'cursor-pointer' : ''
        )}
        onClick={() => editable && setIsEditingCloseTime(true)}
      >
        {neverCloses ? (
          <div className="text-ink-500">Never closes</div>
        ) : (
          closeTime && (
            <DateTimeTooltip
              text={closeTime <= Date.now() ? 'Closed on ' : 'Closes on '}
              time={closeTime}
              placement="bottom-end"
              className="flex flex-nowrap items-center gap-1 whitespace-nowrap"
            >
              {dayjs().isBefore(closeTime) ? (
                <FaClock className="text-ink-500 h-3.5 w-3.5" />
              ) : (
                <MdLockClock className="text-ink-500 h-5 w-5" />
              )}
              {isSameDay
                ? fromNow(closeTime)
                : isSameYear || isSoon
                ? dayJsCloseTime.format('MMM D')
                : dayJsCloseTime.format('YYYY')}
            </DateTimeTooltip>
          )
        )}
        {editable && (
          <PencilIcon className="sm:group-hover:fill-ink-600 hidden h-4 w-4 sm:flex sm:fill-transparent" />
        )}
      </Row>
      <EditCloseTimeModal
        contract={contract}
        isOpen={isEditingCloseTime}
        setOpen={setIsEditingCloseTime}
      />
    </>
  )
}

export const EditCloseTimeModal = (props: {
  contract: Contract
  isOpen: boolean
  setOpen: (isOpen: boolean) => void
  setNewCloseTime?: (closeTime: number) => void
}) => {
  const { contract, isOpen, setOpen, setNewCloseTime } = props
  const { closeTime } = contract
  const isClient = useIsClient()
  const dayJsCloseTime = dayjs(closeTime)
  const dayJsNow = dayjs()

  const [closeDate, setCloseDate] = useState(
    closeTime && dayJsCloseTime.format('YYYY-MM-DD')
  )
  const [closeHoursMinutes, setCloseHoursMinutes] = useState(
    closeTime && dayJsCloseTime.format('HH:mm')
  )

  let newCloseTime = closeDate
    ? dayjs(`${closeDate}T${closeHoursMinutes}`).valueOf()
    : undefined

  const isPoll = contract.outcomeType === 'POLL'
  const isCurrentlyOpen = (contract.closeTime ?? Date.now() + 1) > Date.now()
  const hasChanges = newCloseTime !== closeTime

  async function onSave(customTime?: number) {
    if (customTime) {
      newCloseTime = customTime
      setCloseDate(dayjs(newCloseTime).format('YYYY-MM-DD'))
      setCloseHoursMinutes(dayjs(newCloseTime).format('HH:mm'))
    }
    if (!newCloseTime) return

    setOpen(false)
    if (newCloseTime !== closeTime) {
      await updateMarket({
        contractId: contract.id,
        closeTime: newCloseTime,
      })
      setNewCloseTime?.(newCloseTime)
    }
  }

  return (
    <Modal size="md" open={isOpen} setOpen={setOpen}>
      <Col className="bg-canvas-0 overflow-hidden rounded-xl">
        {/* Header */}
        <div className="border-ink-200 border-b px-6 pb-4 pt-6">
          <Row className="items-center gap-3">
            <div className="bg-primary-100 dark:bg-primary-900/30 flex h-10 w-10 items-center justify-center rounded-full">
              <FaClock className="text-primary-600 dark:text-primary-400 h-5 w-5" />
            </div>
            <Col className="gap-0.5">
              <h2 className="text-ink-900 text-lg font-semibold">
                {isPoll ? 'Voting' : 'Trading'} close time
              </h2>
              <p className="text-ink-500 text-sm">
                {isPoll ? 'Voting' : 'Trading'} will halt at this time
              </p>
            </Col>
          </Row>
        </div>

        {/* Date/Time Inputs */}
        <div className="px-6 py-5">
          <Col className="gap-4">
            <Col className="gap-2">
              <label className="text-ink-600 text-xs font-medium uppercase tracking-wide">
                Date
              </label>
              <Input
                type="date"
                className="dark:date-range-input-white w-full"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCloseDate(e.target.value)}
                min={isClient ? dayJsNow.format('YYYY-MM-DD') : undefined}
                max="9999-12-31"
                value={closeDate}
              />
            </Col>
            <Col className="gap-2">
              <label className="text-ink-600 text-xs font-medium uppercase tracking-wide">
                Time
              </label>
              <Input
                type="time"
                className="dark:date-range-input-white w-full"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCloseHoursMinutes(e.target.value)}
                value={closeHoursMinutes}
              />
            </Col>

            {/* Preview of selected time */}
            {newCloseTime && (
              <div className="bg-canvas-50 text-ink-600 rounded-lg px-3 py-2 text-center text-sm">
                {isPoll ? 'Voting closes' : 'Closes'}{' '}
                <span className="text-ink-900 font-medium">
                  {dayjs(newCloseTime).format('MMM D, YYYY')}
                </span>{' '}
                at{' '}
                <span className="text-ink-900 font-medium">
                  {dayjs(newCloseTime).format('h:mm A')}
                </span>
              </div>
            )}
          </Col>
        </div>

        {/* Footer */}
        <div className="border-ink-200 bg-canvas-50 border-t px-6 py-4">
          <Row className="items-center justify-between">
            {isCurrentlyOpen ? (
              <Button
                size="xs"
                color="red-outline"
                onClick={() => onSave(Date.now())}
              >
                <MdLockClock className="mr-1.5 h-4 w-4" />
                Close now
              </Button>
            ) : (
              <div />
            )}
            <Button
              color="indigo"
              onClick={() => onSave()}
              disabled={!hasChanges}
            >
              Save changes
            </Button>
          </Row>
        </div>
      </Col>
    </Modal>
  )
}
