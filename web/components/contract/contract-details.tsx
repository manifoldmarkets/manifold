import {
  ClockIcon,
  DatabaseIcon,
  PencilIcon,
  TrendingUpIcon,
  UserGroupIcon,
} from '@heroicons/react/outline'
import Router from 'next/router'
import clsx from 'clsx'
import { Editor } from '@tiptap/react'
import dayjs from 'dayjs'

import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { UserLink } from '../user-page'
import { Contract, updateContract } from 'web/lib/firebase/contracts'
import { DateTimeTooltip } from '../datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../avatar'
import { useState } from 'react'
import { ContractInfoDialog } from './contract-info-dialog'
import { Bet } from 'common/bet'
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
import { FeaturedContractBadge } from 'web/components/contract/featured-contract-badge'

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
        <Row className={'shrink-0'}>{formatMoney(contract.volume)} bet</Row>
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
  const { creatorName, creatorUsername } = contract

  return (
    <Row
      className={clsx('items-center gap-2 text-sm text-gray-400', className)}
    >
      <Avatar
        username={creatorUsername}
        avatarUrl={contract.creatorAvatarUrl}
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
  bets: Bet[]
  user: User | null | undefined
  isCreator?: boolean
  disabled?: boolean
}) {
  const { contract, bets, isCreator, disabled } = props
  const { closeTime, creatorName, creatorUsername, creatorId, groupLinks } =
    contract
  const { volumeLabel, resolvedDate } = contractMetrics(contract)

  const groupToDisplay =
    groupLinks?.sort((a, b) => a.createdTime - b.createdTime)[0] ?? null
  const user = useUser()
  const [open, setOpen] = useState(false)

  const groupInfo = (
    <Row>
      <UserGroupIcon className="mx-1 inline h-5 w-5 shrink-0" />
      <span className="truncate">
        {groupToDisplay ? groupToDisplay.name : 'No group'}
      </span>
    </Row>
  )

  return (
    <Row className="flex-1 flex-wrap items-center gap-2 text-sm text-gray-500 md:gap-x-4 md:gap-y-2">
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
        {!disabled && <UserFollowButton userId={creatorId} small />}
      </Row>
      <Row>
        {disabled ? (
          groupInfo
        ) : !groupToDisplay && !user ? (
          <div />
        ) : (
          <Row>
            <Button
              size={'xs'}
              className={'max-w-[200px] pr-1'}
              color={'gray-white'}
              onClick={() =>
                groupToDisplay
                  ? Router.push(groupPath(groupToDisplay.slug))
                  : setOpen(!open)
              }
            >
              {groupInfo}
            </Button>
            <Button
              size={'xs'}
              className={'!px-2'}
              color={'gray-white'}
              onClick={() => setOpen(!open)}
            >
              <PencilIcon className="inline h-5 w-5 shrink-0" />
            </Button>
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
        <Row className="items-center gap-1">
          {resolvedDate && contract.resolutionTime ? (
            <>
              <ClockIcon className="h-5 w-5" />
              <DateTimeTooltip
                text="Market resolved:"
                time={dayjs(contract.resolutionTime)}
              >
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
          <Row className="items-center gap-1">
            <DatabaseIcon className="h-5 w-5" />
            <div className="whitespace-nowrap">{volumeLabel}</div>
          </Row>
          {!disabled && <ContractInfoDialog contract={contract} bets={bets} />}
        </>
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
    closeTime && dayJsCloseTime.format('YYYY-MM-DDTHH:mm')
  )

  const isSameYear = dayJsCloseTime.isSame(dayJsNow, 'year')
  const isSameDay = dayJsCloseTime.isSame(dayJsNow, 'day')

  const onSave = () => {
    const newCloseTime = dayjs(closeDate).valueOf()
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
          time={dayJsCloseTime}
        >
          {isSameYear
            ? dayJsCloseTime.format('MMM D')
            : dayJsCloseTime.format('MMM D, YYYY')}
          {isSameDay && <> ({fromNow(closeTime)})</>}
        </DateTimeTooltip>
      )}

      {isCreator &&
        (isEditingCloseTime ? (
          <button className="btn btn-xs" onClick={onSave}>
            Done
          </button>
        ) : (
          <Button
            size={'xs'}
            color={'gray-white'}
            onClick={() => setIsEditingCloseTime(true)}
          >
            <PencilIcon className="mr-0.5 inline h-4 w-4" /> Edit
          </Button>
        ))}
    </>
  )
}
