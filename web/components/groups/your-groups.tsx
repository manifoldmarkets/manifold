import { useEffect, useState } from 'react'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { Subtitle } from '../widgets/subtitle'
import { Row } from '../layout/row'
import { PRIVACY_STATUS_ITEMS } from './group-privacy-modal'
import { Input } from '../widgets/input'
import { Group } from 'common/group'
import { Col } from '../layout/col'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  UserGroupIcon,
} from '@heroicons/react/solid'
import { useGroupsWhereUserHasRole } from 'web/hooks/use-group-supabase'
import { GroupAndRoleType } from 'web/lib/supabase/groups'
import { MemberRoleTag } from './group-member-modal'
import Link from 'next/link'
import { Spacer } from '../layout/spacer'
import { User } from 'common/user'
import { Button } from '../buttons/button'
import GroupSearch from './group-search'

const YOUR_GROUPS_MAX_LENGTH = 5
export default function YourGroups() {
  const isAuth = useIsAuthorized()
  const [query, setQuery] = useState('')
  const user = useUser()
  const userId = user?.id
  const yourGroups = useGroupsWhereUserHasRole(user?.id)
  const yourGroupsLength = yourGroups?.length
  const [showAllYourGroups, setShowAllYourGroups] = useState(false)

  const yourShownGroups = showAllYourGroups
    ? yourGroups
    : yourGroups?.slice(0, 5)

  return (
    <>
      {yourShownGroups && yourShownGroups.length > 0 && user && (
        <>
          <Subtitle>Groups You Moderate</Subtitle>
          <Col className="gap-3">
            {yourShownGroups.map((g) => {
              return <YourGroup groupAndRole={g} user={user} />
            })}
            {yourGroupsLength && yourGroupsLength > YOUR_GROUPS_MAX_LENGTH && (
              <Row className="w-full justify-end">
                <button
                  onClick={() => {
                    setShowAllYourGroups(!showAllYourGroups)
                  }}
                >
                  <Row className="align-center justify-items-center gap-1 text-sm text-indigo-700 dark:text-indigo-400">
                    <span>
                      Show {yourGroupsLength - YOUR_GROUPS_MAX_LENGTH}{' '}
                      {showAllYourGroups ? 'less' : 'more'}
                    </span>
                    {showAllYourGroups ? (
                      <ChevronUpIcon className="h-5 w-5" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5" />
                    )}
                  </Row>
                </button>
              </Row>
            )}
          </Col>
        </>
      )}
      <Subtitle>Groups You Follow</Subtitle>
      {isAuth && (
        <GroupSearch
          filter={{
            yourGroups: true,
          }}
          persistPrefix={'your-groups'}
          myGroupIds={[]}
        />
      )}
    </>
  )
}

function YourGroup(props: { groupAndRole: GroupAndRoleType; user: User }) {
  const { groupAndRole, user } = props
  const { group, role } = groupAndRole
  const { icon, status } = PRIVACY_STATUS_ITEMS[group.privacyStatus]
  return (
    <Link
      href={`/group/${group.slug}`}
      className="bg-canvas-0 hover:bg-canvas-100 flex flex-col rounded-lg p-4 transition-all"
    >
      <Row className="justify-between gap-4 text-lg">
        <span>{group.name}</span>{' '}
        <Row className="h-min w-fit whitespace-nowrap rounded bg-indigo-400 bg-opacity-20 px-2 py-0.5 text-sm text-indigo-700 dark:text-indigo-400">
          {group.creatorId == user.id
            ? 'You are the creator'
            : role == 'admin'
            ? 'You are an admin'
            : `You are a ${role}`}
        </Row>
      </Row>
      <Spacer h={2} />
      <Row className="text-ink-700 gap-3 text-sm ">
        <Row className="h-min items-center gap-1">
          <UserGroupIcon className="h-4 w-4" />
          <span>{group.totalMembers} members</span>
        </Row>
        <Row className="items-center gap-1">
          {icon}
          {status}
        </Row>
      </Row>
    </Link>
  )
}
