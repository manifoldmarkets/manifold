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
import { CATEGORY_LIST } from 'common/categories'
import { TagsList } from '../tags-list'
import { UserFollowButton } from '../follow-button'
import { groupPath } from 'web/lib/firebase/groups'
import { SiteLink } from 'web/components/site-link'
import { DAY_MS } from 'common/util/time'
import { useGroupsWithContract } from 'web/hooks/use-group'
import { ShareIconButton } from 'web/components/share-icon-button'
import { useUser } from 'web/hooks/use-user'
import { Editor } from '@tiptap/react'
import { exhibitExts } from 'common/util/parse'
import { ENV_CONFIG } from 'common/envs/constants'

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
    tags,
    isResolved,
    createdTime,
    resolutionTime,
  } = contract
  // Show at most one category that this contract is tagged by
  const categories = CATEGORY_LIST.filter((category) =>
    tags.map((t) => t.toLowerCase()).includes(category)
  ).slice(0, 1)
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
        <Row>{contractPool(contract)} pool</Row>
      ) : (
        <NewContractBadge />
      )}

      {categories.length > 0 && (
        <TagsList className="text-gray-400" tags={categories} noLabel />
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
  const { closeTime, creatorName, creatorUsername, creatorId } = contract
  const { volumeLabel, resolvedDate } = contractMetrics(contract)

  const groups = (useGroupsWithContract(contract.id) ?? []).sort((g1, g2) => {
    return g2.createdTime - g1.createdTime
  })
  const user = useUser()

  const groupsUserIsMemberOf = groups
    ? groups.filter((g) => g.memberIds.includes(contract.creatorId))
    : []
  const groupsUserIsCreatorOf = groups
    ? groups.filter((g) => g.creatorId === contract.creatorId)
    : []

  // Priorities for which group the contract belongs to:
  // In order of created most recently
  // Group that the contract owner created
  // Group the contract owner is a member of
  // Any group the contract is in
  const groupToDisplay =
    groupsUserIsCreatorOf.length > 0
      ? groupsUserIsCreatorOf[0]
      : groupsUserIsMemberOf.length > 0
      ? groupsUserIsMemberOf[0]
      : groups
      ? groups[0]
      : undefined
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
      {groupToDisplay ? (
        <Row className={'line-clamp-1 mt-1 max-w-[200px]'}>
          <SiteLink href={`${groupPath(groupToDisplay.slug)}`}>
            <UserGroupIcon className="mx-1 mb-1 inline h-5 w-5" />
            <span>{groupToDisplay.name}</span>
          </SiteLink>
        </Row>
      ) : (
        <div />
      )}

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
          <button
            className="btn btn-xs btn-ghost"
            onClick={() => setIsEditingCloseTime(true)}
          >
            <PencilIcon className="mr-2 inline h-4 w-4" /> Edit
          </button>
        ))}
    </>
  )
}
