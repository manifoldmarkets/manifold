import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from '../widgets/loading-indicator'
import GroupSearch from './group-search'

export default function YourGroups(props: { yourGroupIds?: string[] }) {
  const { yourGroupIds } = props
  const isAuth = useIsAuthorized()
  const user = useUser()
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
