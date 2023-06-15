import { User } from 'common/user'
import { useEffect } from 'react'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'

export const useShouldShowFeed = (user: User | null | undefined) => {
  const [shouldShowFeed, setShouldShowFeed] = usePersistentLocalState(
    false,
    'should-show-feed'
  )
  useEffect(() => {
    if (!user || shouldShowFeed) return
    const query = db
      .from('user_feed')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', user.id)
      .limit(50)

    run(query).then(({ data, count }) => {
      if (count > 50) setShouldShowFeed(true)
    })
  }, [user?.id])

  return shouldShowFeed
}
