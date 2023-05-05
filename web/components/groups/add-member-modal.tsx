import { ChevronDownIcon } from '@heroicons/react/solid'
import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import { Group } from 'common/group'
import { buildArray } from 'common/util/array'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { usePollingGroupMemberIds } from 'web/hooks/use-group-supabase'
import { useIsAuthorized } from 'web/hooks/use-user'
import { addGroupMember, createGroupInvite } from 'web/lib/firebase/api'
import { searchUsersNotInGroup } from 'web/lib/supabase/users'
import { Button, buttonClass } from '../buttons/button'
import DropdownMenu from '../comments/dropdown-menu'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'
import { UserLink } from '../widgets/user-link'
import { getGroupInviteUrl, truncatedUrl } from 'common/util/invite-group'
import { CopyLinkButton } from '../buttons/copy-link-button'
import { Select } from '../widgets/select'

const QUERY_SIZE = 7

export const durationOptions = [
  '1 hour',
  '1 week',
  '1 month',
  '1 year',
  'Forever',
]

export const maxUsesOptions = [1, 5, 10, 25, 50, 100, Infinity]

export function AddMemberContent(props: {
  query: string
  setQuery: (query: string) => void
  group: Group
}) {
  const { query, setQuery, group } = props

  const [searchMemberResult, setSearchMemberResult] = useState<JSONContent[]>(
    []
  )
  const requestId = useRef(0)
  const [loading, setLoading] = useState(false)

  const [groupMemberIds] = usePollingGroupMemberIds(group.id)

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    searchUsersNotInGroup(query, QUERY_SIZE, group.id)
      .then((results) => {
        // if there's a more recent request, forget about this one
        if (id === requestId.current) {
          setSearchMemberResult(results)
        }
      })
      .finally(() => setLoading(false))
  }, [query])

  return (
    <Col className="relative h-full w-full justify-between ">
      <Col className="w-full gap-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users"
          className={clsx('placeholder:text-ink-400 w-full')}
        />
        <Col
          className={clsx(
            loading ? 'animate-pulse' : '',
            'gap-4',
            'h-full w-full overflow-y-auto'
          )}
        >
          {searchMemberResult.length == 0 && (
            <div className="text-ink-500">No members found</div>
          )}
          {searchMemberResult.map((user) => (
            <AddMemberWidget
              key={user.id}
              user={user}
              group={group}
              isDisabled={groupMemberIds?.data.some(
                (r) => r.member_id == user.id
              )}
            />
          ))}
        </Col>
      </Col>
      {group.privacyStatus === 'private' && <PrivateGroupLink group={group} />}
    </Col>
  )
}

export function PrivateGroupLink(props: { group: Group }) {
  const { group } = props
  const [inviteSlug, setInviteSlug] = useState<string | undefined>(undefined)
  const [slugLoading, setSlugLoading] = useState(false)
  const [maxUses, setMaxUses] = useState(Infinity)
  const [duration, setDuration] = useState('1 week')
  const isAuth = useIsAuthorized()
  useEffect(() => {
    if (isAuth) {
      setSlugLoading(true)
      createGroupInvite({
        groupId: group.id,
        maxUses: maxUses === Infinity ? undefined : maxUses,
        duration: duration === 'Forever' ? undefined : duration,
      })
        .then((result) => setInviteSlug(result.inviteSlug))
        .finally(() => setSlugLoading(false))
    }
  }, [isAuth, maxUses, duration])

  const realUrl = inviteSlug ? getGroupInviteUrl(group, inviteSlug) : undefined
  return (
    <Col className="bg-canvas-0 absolute bottom-0 w-full gap-3">
      <Row className="w-full items-center">
        <div className="bg-ink-300 h-0.5 flex-1" />
        <div className="text-ink-300 px-2">OR</div>
        <div className="bg-ink-300 h-0.5 flex-1" />
      </Row>
      <div className="font-semibold">Send an invite link</div>
      <Row className="w-full gap-3">
        <Col className="w-1/2 gap-0.5">
          <div className="text-ink-300 text-xs">DURATION</div>
          <Select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="!h-full w-full grow py-1"
          >
            {durationOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Col>
        <Col className="w-1/2 gap-0.5">
          <div className="text-ink-300 text-xs">USES</div>
          <Select
            value={maxUses === Infinity ? 'Unlimited' : maxUses}
            onChange={(e) => {
              const value =
                e.target.value === 'Unlimited'
                  ? Infinity
                  : parseInt(e.target.value, 10)
              setMaxUses(value)
            }}
            className="!h-full w-full grow py-1"
          >
            {maxUsesOptions.map((option) => (
              <option
                key={option === Infinity ? 'Unlimited' : `${option} uses`}
                value={option === Infinity ? 'Unlimited' : option}
              >
                {option === Infinity ? 'Unlimited' : `${option} uses`}
              </option>
            ))}
          </Select>
        </Col>
      </Row>
      <CopyLinkButton
        url={realUrl}
        loading={slugLoading}
        eventTrackingName={'copy market link'}
        displayUrl={realUrl ? truncatedUrl(realUrl) : ''}
      />
      <div className="text-ink-700 text-sm">
        This link will immediately allow anyone who has it to join your group
      </div>
    </Col>
  )
}

export function AddMemberWidget(props: {
  user: JSONContent
  group: Group
  isDisabled?: boolean
}) {
  const { user, group, isDisabled } = props
  const [disabled, setDisabled] = useState(isDisabled)
  const errorMessage = 'Could not add member, try again?'
  const groupMemberOptions = buildArray(
    // ADMIN ONLY: if the member is below admin, can upgrade to admin{
    {
      name: 'Add as moderator',
      onClick: async () => {
        toast.promise(
          addGroupMember({
            groupId: group.id,
            userId: user.id,
            role: 'moderator',
          }),
          {
            loading: `Adding ${user.name} as moderator...`,
            success: `${user.name} is now a moderator!`,
            error: errorMessage,
          }
        )
      },
    },
    {
      name: 'Add as admin',
      onClick: async () => {
        toast.promise(
          addGroupMember({
            groupId: group.id,
            userId: user.id,
            role: 'admin',
          }),
          {
            loading: `Adding ${user.name} to admin...`,
            success: `${user.name} is now a admin!`,
            error: errorMessage,
          }
        )
      },
    }
  )
  return (
    <Row className="w-full items-center justify-between gap-4">
      <Row className="w-3/4 gap-2">
        <Avatar
          username={user.username}
          avatarUrl={user.avatarurl}
          size="xs"
          noLink
        />
        <span className="line-clamp-1 overflow-hidden">
          <UserLink name={user.name} username={user.username} />
        </span>
      </Row>
      <Row>
        <Button
          color="indigo-outline"
          size="2xs"
          disabled={disabled}
          className={'rounded-r-none'}
          onClick={() =>
            toast.promise(
              addGroupMember({ groupId: group.id, userId: user.id }).then(() =>
                setDisabled(true)
              ),
              {
                loading: `Adding ${user.name}`,
                success: `Added ${user.name}`,
                error: `Unable to add ${user.name}. Try again?`,
              }
            )
          }
        >
          Add
        </Button>
        <DropdownMenu
          Items={groupMemberOptions}
          Icon={
            <ChevronDownIcon
              className={clsx(
                'text-primary-500 group-hover:text-canvas-50 h-5 w-5'
              )}
            />
          }
          menuWidth={'w-40'}
          buttonClass={clsx(
            buttonClass('2xs', 'indigo-outline'),
            'rounded-l-none border-l-0 px-1 py-[6px] group'
          )}
        />
      </Row>
    </Row>
  )
}
