import { FaBookmark, FaRegBookmark } from 'react-icons/fa6'
import { useUserFollowsDashboard } from 'web/hooks/use-dashboard-follows'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { followDashboard } from 'web/lib/firebase/api'
import { Tooltip } from '../widgets/tooltip'
import { Col } from '../layout/col'

export function FollowDashboardButton(props: { dashboardId: string }) {
  const { dashboardId } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useUserFollowsDashboard(
    user?.id,
    dashboardId
  )
  const isAuth = useIsAuthorized()
  if (!user || !isAuth) {
    return null
  }
  return (
    <Col className="my-auto items-center">
      <Tooltip text={'Bookmark'} placement='left-start'>
        <button
          onClick={() =>
            followDashboard({ dashboardId: dashboardId }).then((result) => {
              setIsFollowing(result.isFollowing)
            })
          }
        >
          {isFollowing ? (
            <FaBookmark className="h-6 w-6 text-yellow-500" />
          ) : (
            <FaRegBookmark className="text-ink-500 h-6 w-6" />
          )}
        </button>
      </Tooltip>
    </Col>
  )
}
