import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Subtitle } from '../widgets/subtitle'
import { Row } from '../layout/row'
import { PRIVACY_STATUS_ITEMS } from './group-privacy-modal'
import { Input } from '../widgets/input'
import { Group } from 'common/group'
import { Col } from '../layout/col'
import { UserGroupIcon } from '@heroicons/react/solid'
import { useGroupsWhereUserHasRole } from 'web/hooks/use-group-supabase'
import { GroupAndRoleType } from 'web/lib/supabase/groups'
import { MemberRoleTag } from './group-member-modal'

export default function YourGroups() {
  const [query, setQuery] = useState('')
  const user = useUser()
  const userId = user?.id
  const yourGroups = useGroupsWhereUserHasRole(user?.id)
  //   const otherGroups = props.groups.filter(
  //     (g) => !allSpecialGroupSlugs.includes(g.slug)
  //   )

  //   const searchedGroups = useGroupSearchResults(query, 50)
  //   const groups = query !== '' ? searchedGroups : []

  function sortGroupsYouManage(a: GroupAndRoleType, b: GroupAndRoleType) {
    if ((a.group.creatorId === userId) === (b.group.creatorId === userId)) {
      if ((a.role === 'admin') === (b.role === 'admin')) {
        return 0
      }
      if (a.role === 'admin') {
        return -1
      }
      return 1
    }
    if (a.group.creatorId === userId) {
      return -1
    }
    return 1
  }
  return (
    <>
      {yourGroups && yourGroups.length > 0 && (
        <>
          {/* <Subtitle>Your Groups</Subtitle> */}
          <Col className="gap-3">
            {yourGroups.sort(sortGroupsYouManage).map((g) => {
              return <YourGroup groupAndRole={g} />
            })}
          </Col>
        </>
      )}

      <Subtitle>Search Groups</Subtitle>

      <Input
        type="text"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search groups"
        value={query}
        className="mb-4 w-full"
      />
      {/* 
      <div className="grid grid-cols-1">
        <GroupSearchResult groups={groups} />
      </div> */}
    </>
  )
}

function YourGroup(props: { groupAndRole: GroupAndRoleType }) {
  const { groupAndRole } = props
  const { group, role } = groupAndRole
  const { icon, status } = PRIVACY_STATUS_ITEMS[group.privacyStatus]
  return (
    <Col className="bg-canvas-0 gap-2 rounded py-2 px-4">
      <Row className="justify-between gap-4 text-lg">
        <span>{group.name}</span>
        <Row>
          <MemberRoleTag role={role} />
        </Row>
      </Row>
      <Row className="text-ink-700 gap-3 text-sm ">
        <Row className=" items-center gap-1">
          <UserGroupIcon className="h-4 w-4" />
          <span>{group.totalMembers} members</span>
        </Row>
        <Row className=" gap-1">
          {icon}
          {status}
        </Row>
      </Row>
    </Col>
  )
}
