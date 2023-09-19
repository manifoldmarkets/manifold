import { PencilIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { Row } from '../layout/row'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
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
import { FollowButton } from '../buttons/follow-button'

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
          size={'xs'}
        />
      </div>

      <UserLink
        name={creatorName}
        username={creatorUsername}
        createdTime={creatorCreatedTime}
      />

      <FollowButton userId={contract.creatorId} size="2xs" />
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
          text="Question resolved:"
          time={resolutionTime}
          placement="bottom-start"
        >
          resolved {dayjs(resolutionTime).format('MMM D')}
        </DateTimeTooltip>
      )}

      {!isResolved && (
        <EditableCloseDate
          closeTime={closeTime}
          contract={contract}
          editable={!!editable}
        />
      )}
    </Row>
  )
}

function EditableCloseDate(props: {
  closeTime: number | undefined
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
  const almostForeverTime = dayjs(contract.createdTime).add(
    dayjs.duration(900, 'year')
  )
  const neverCloses =
    !closeTime ??
    (NO_CLOSE_TIME_TYPES.includes(contract.outcomeType) &&
      dayjs(closeTime).isAfter(almostForeverTime))
  return (
    <>
      <Modal
        size="md"
        open={isEditingCloseTime}
        setOpen={setIsEditingCloseTime}
        position="top"
      >
        <Col className="bg-canvas-0 rounded-lg p-8">
          <Title className="!text-2xl">Close time</Title>
          <div className="mb-4">
            {contract.outcomeType === 'POLL' ? 'Voting' : 'Trading'} will halt
            at this time
          </div>
          <Row className="items-stretch gap-2">
            <Input
              type="date"
              className="dark:date-range-input-white shrink-0 sm:w-fit"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setCloseDate(e.target.value)}
              min={isClient ? dayJsNow.format('YYYY-MM-DD') : undefined}
              max="9999-12-31"
              value={closeDate}
            />
            <Input
              type="time"
              className="dark:date-range-input-white shrink-0 sm:w-max"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setCloseHoursMinutes(e.target.value)}
              value={closeHoursMinutes}
            />
            <Button size="xl" onClick={() => onSave()}>
              Save
            </Button>
          </Row>

          {(contract.closeTime ?? Date.now() + 1) > Date.now() && (
            <Row className="mt-8 justify-center">
              <Button
                size={'xs'}
                color="yellow"
                onClick={() => onSave(Date.now())}
              >
                Close question now
              </Button>
            </Row>
          )}
        </Col>
      </Modal>

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
              text={
                closeTime <= Date.now() ? 'Trading ended:' : 'Trading ends:'
              }
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
          )
        )}
        {editable && (
          <PencilIcon className="sm:group-hover:fill-ink-600 h-4 w-4 sm:fill-transparent" />
        )}
      </Row>
    </>
  )
}
