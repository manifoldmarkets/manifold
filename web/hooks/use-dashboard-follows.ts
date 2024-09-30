import { SupabaseClient, run } from 'common/supabase/utils'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'

export const useUserFollowsDashboard = (
  userId: string | undefined,
  dashboardId: string
) => {
  const [isFollowing, setIsFollowing] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    if (userId) {
      getUserFollowsDashboard(userId, dashboardId, db).then((res) => {
        setIsFollowing(res)
      })
    }
  }, [userId, dashboardId])
  return { isFollowing, setIsFollowing }
}

async function getUserFollowsDashboard(
  userId: string,
  dashboardId: string,
  db: SupabaseClient
) {
  const { data: follows } = await run(
    db
      .from('dashboard_follows')
      .select('*')
      .eq('follower_id', userId)
      .eq('dashboard_id', dashboardId)
      .limit(1)
  )

  return follows.length > 0
}
