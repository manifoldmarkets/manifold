import {
  ClockIcon,
  DatabaseIcon,
  PencilIcon,
  TrendingUpIcon,
  UserGroupIcon,
} from '@heroicons/react/outline'
import { Row } from '../layout/row'
import { formatMoney } from 'common/util/format'
import { UserLink } from '../user-page'
import {
  Contract,
  contractMetrics,
  contractPath,
  contractPool,
  updateContract,
} from 'web/lib/firebase/contracts'
import dayjs from 'dayjs'
import { DateTimeTooltip } from '../datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../avatar'
import { useState } from 'react'
import { ContractInfoDialog } from './contract-info-dialog'
import { Bet } from 'common/bet'
import NewContractBadge from '../new-contract-badge'
import { UserFollowButton } from '../follow-button'
import { DAY_MS } from 'common/util/time'
import { ShareIconButton } from 'web/components/share-icon-button'
import { useUser } from 'web/hooks/use-user'
import { Editor } from '@tiptap/react'
import { exhibitExts } from 'common/util/parse'
import { ENV_CONFIG } from 'common/envs/constants'
import { Button } from 'web/components/button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { SiteLink } from 'web/components/site-link'
import { groupPath } from 'web/lib/firebase/groups'

export type ShowTime = 'resolve-date' | 'close-date'

export function MiscDetails(props: {
  contract: Contract
  showHotVolume?: boolean
  showTime?: ShowTime
}) {
  const { contract, showHotVolume, showTime } = props
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
    <Row className="items-center gap-3 text-sm text-gray-400">
      {showHotVolume ? (
        <Row className="gap-0.5">
          <TrendingUpIcon className="h-5 w-5" /> {formatMoney(volume24Hours)}
        </Row>
      ) : showTime === 'close-date' ? (
        <Row className="gap-0.5">
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
      ) : volume > 0 || !isNew ? (
        <Row className={'shrink-0'}>{formatMoney(contract.volume)} bet</Row>
      ) : (
        <NewContractBadge />
      )}

      {groupLinks && groupLinks.length > 0 && (
        <SiteLink
          href={groupPath(groupLinks[0].slug)}
          className="text-sm text-gray-400"
        >
          <Row className={'line-clamp-1 flex-wrap items-center '}>
            <UserGroupIcon className="mx-1 mb-0.5 inline h-4 w-4 shrink-0" />
            {groupLinks[0].name}
          </Row>
        </SiteLink>
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
        {!disabled && <UserFollowButton userId={creatorId} small />}
      </Row>
      <Row>
        <Button
          size={'xs'}
          className={'max-w-[200px]'}
          color={'gray-white'}
          onClick={() => setOpen(!open)}
        >
          <Row>
            <UserGroupIcon className="mx-1 inline h-5 w-5 shrink-0" />
            <span className={'line-clamp-1'}>
              {groupToDisplay ? groupToDisplay.name : 'No group'}
            </span>
          </Row>
        </Button>
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
          <ClockIcon className="h-5 w-5" />

          {resolvedDate && contract.resolutionTime ? (
            <>
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
              <EditableCloseDate
                closeTime={closeTime}
                contract={contract}
                isCreator={isCreator ?? false}
              />
            </>
          )}
        </Row>
      )}

      <Row className="items-center gap-1">
        <DatabaseIcon className="h-5 w-5" />

        <div className="whitespace-nowrap">{volumeLabel}</div>
      </Row>
      <ShareIconButton
        copyPayload={`https://${ENV_CONFIG.domain}${contractPath(contract)}${
          user?.username && contract.creatorUsername !== user?.username
            ? '?referrer=' + user?.username
            : ''
        }`}
        toastClassName={'sm:-left-40 -left-24 min-w-[250%]'}
      />

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
    closeTime && dayjs(closeTime).format('YYYY-MM-DDTHH:mm')
  )

  const isSameYear = dayjs(closeTime).isSame(dayjs(), 'year')
  const isSameDay = dayjs(closeTime).isSame(dayjs(), 'day')

  const onSave = () => {
    const newCloseTime = dayjs(closeDate).valueOf()
    if (newCloseTime === closeTime) setIsEditingCloseTime(false)
    else if (newCloseTime > Date.now()) {
      const content = contract.description
      const formattedCloseDate = dayjs(newCloseTime).format('YYYY-MM-DD h:mm a')

      const editor = new Editor({ content, extensions: exhibitExts })
      editor
        .chain()
        .focus('end')
        .insertContent('<br /><br />')
        .insertContent(`Close date updated to ${formattedCloseDate}`)
        .run()

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
