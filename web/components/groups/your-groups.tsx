import { useState } from 'react'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { Subtitle } from '../widgets/subtitle'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { useGroupsWhereUserHasRole } from 'web/hooks/use-group-supabase'
import { GroupAndRoleType } from 'web/lib/supabase/groups'
import Link from 'next/link'
import { Spacer } from '../layout/spacer'
import { User } from 'common/user'
import GroupSearch from './group-search'
import { GroupSummary } from './discover-groups'
import { LoadingIndicator } from '../widgets/loading-indicator'

const YOUR_GROUPS_MAX_LENGTH = 5
export default function YourGroups(props: { yourGroupIds?: string[] }) {
  const { yourGroupIds } = props
  const isAuth = useIsAuthorized()
  const user = useUser()
  const yourGroups = useGroupsWhereUserHasRole(user?.id)
  const yourGroupsLength = yourGroups?.length
  const [showAllYourGroups, setShowAllYourGroups] = useState(false)

  const yourShownGroups = showAllYourGroups
    ? yourGroups
    : yourGroups?.slice(0, 5)

  return (
    <>
      {isAuth ? (
        <GroupSearch
          filter={{
            yourGroups: true,
          }}
          persistPrefix={'your-groups'}
          yourGroupIds={yourGroupIds}
          user={user}
        />
      ) : (
        <>
          <LoadingIndicator />
        </>
      )}
    </>
  )
}
