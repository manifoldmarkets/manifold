import { FaBookmark, FaRegBookmark } from 'react-icons/fa6'
import { useUserFollowsDashboard } from 'web/hooks/use-dashboard-follows'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { followDashboard } from 'web/lib/firebase/api'
import { Tooltip } from '../widgets/tooltip'
import { Col } from '../layout/col'
import clsx from 'clsx'

export function FollowDashboardButton(props: {
  dashboardId: string
  dashboardCreatorId: string
  size?: 'sm' | 'md'
}) {
  const { dashboardId, dashboardCreatorId, size = 'md' } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useUserFollowsDashboard(
    user?.id,
    dashboardId
  )
  const isAuth = useIsAuthorized()
  if (
    !user ||
    !isAuth
    || dashboardCreatorId === user?.id
  ) {
    return null
  }
  return (
    <Tooltip text={'Bookmark'} placement="left-start">
      <button
        onClick={() =>
          followDashboard({ dashboardId: dashboardId }).then((result) => {
            setIsFollowing(result.isFollowing)
          })
        }
      >
        {isFollowing ? (
          <FaBookmark className={'h-5 w-5 text-yellow-500'} />
        ) : (
          <FaRegBookmark className={'text-ink-500 h-5 w-5'} />
        )}
      </button>
    </Tooltip>
  )
}
